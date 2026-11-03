const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

require('reflect-metadata');
const databaseRequire = createRequire(
  resolve('../../packages/database/package.json'),
);
databaseRequire('dotenv').config({ path: '../../.env', quiet: true });
const { ConfigService } = require('@nestjs/config');
const { Test } = require('@nestjs/testing');
const { createDatabase, createDatabaseUrl } = require('@project/database');
const { users } = require('@project/database/schema');
const { hash } = require('argon2');
const Redis = require('ioredis');
const request = require('supertest');

const { AppModule } = require('../dist/app.module');
const { EnvironmentService } = require('../dist/config/environment.service');
const {
  validateEnvironment,
} = require('../dist/config/environment.validation');
const { configureHttpApp } = require('../dist/config/http.config');
const { smtpServer } = require('./helpers/smtp-server.cjs');

async function until(check, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (true) {
    const result = await check();
    if (result) return result;
    assert(Date.now() < deadline, 'Timed out waiting for email delivery state');
    await delay(25);
  }
}

test(
  'full API starts without SMTP and real queued deliveries recover without restarting it',
  { timeout: 60000 },
  async (t) => {
    for (const key of ['POSTGRES_HOST', 'REDIS_HOST'])
      assert(
        ['localhost', '127.0.0.1'].includes(process.env[key]),
        `${key}: local services only`,
      );
    const smtp = await smtpServer(t, 'greeting-stall');
    const namespace = `email_app_${randomUUID().replaceAll('-', '')}`;
    const env = process.env;
    const { db, pool } = createDatabase({
      connectionString: createDatabaseUrl({
        host: env.POSTGRES_HOST,
        port: Number(env.POSTGRES_PORT),
        user: env.POSTGRES_USER,
        password: env.POSTGRES_PASSWORD,
        database: env.POSTGRES_DB,
        schema: namespace,
      }),
    });
    const redis = new Redis({
      host: env.REDIS_HOST,
      port: Number(env.REDIS_PORT),
      lazyConnect: true,
      connectTimeout: 1000,
      commandTimeout: 1000,
      retryStrategy: null,
    });
    redis.on('error', () => undefined);
    let app,
      directory,
      createdSchema = false;
    t.after(async () => {
      try {
        if (app) {
          await app.close();
        }
      } finally {
        await Promise.all([
          (async () => {
            if (createdSchema)
              await pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
          })().finally(() => pool.end()),
          (async () => {
            if (redis.status !== 'ready') await redis.connect();
            const keys = [];
            let cursor = '0';
            do {
              const [next, batch] = await redis.scan(
                cursor,
                'MATCH',
                `${namespace}:*`,
                'COUNT',
                1000,
              );
              cursor = next;
              keys.push(...batch);
            } while (cursor !== '0');
            for (let i = 0; i < keys.length; i += 500)
              await redis.del(...keys.slice(i, i + 500));
          })().finally(() => redis.disconnect()),
          directory
            ? rm(directory, { recursive: true, force: true })
            : Promise.resolve(),
        ]);
      }
    });
    await redis.connect();
    await pool.query(`CREATE SCHEMA "${namespace}"`);
    createdSchema = true;
    const migrations = resolve('../../packages/database/migrations');
    const journal = JSON.parse(
      await readFile(join(migrations, 'meta/_journal.json'), 'utf8'),
    );
    for (const entry of journal.entries)
      await pool.query(
        (
          await readFile(join(migrations, `${entry.tag}.sql`), 'utf8')
        ).replaceAll('"public".', `"${namespace}".`),
      );
    const password = 'Local-SMTP-test-password!';
    await db.insert(users).values({
      email: 'admin@email-app.test',
      firstName: 'SMTP',
      lastName: 'Test',
      status: 'ACTIVE',
      role: 'ADMIN',
      passwordHash: await hash(password),
    });
    directory = await mkdtemp(join(tmpdir(), 'edu-email-app-'));
    const origin = 'http://localhost:3001';
    const environment = new EnvironmentService(
      new ConfigService(
        validateEnvironment({
          ...env,
          NODE_ENV: 'test',
          LOG_LEVEL: 'silent',
          FRONTEND_ORIGIN: origin,
          POSTGRES_SCHEMA: namespace,
          REDIS_QUEUE_PREFIX: namespace,
          RATE_LIMIT_REDIS_PREFIX: `${namespace}:limits`,
          TRUSTED_PROXIES: '',
          STORAGE_DRIVER: 'local',
          STORAGE_LOCAL_ROOT: directory,
          ACCESS_JWT_SECRET: `${namespace}-access`,
          INVITATION_TOKEN_SECRET: `${namespace}-invite`,
          PASSWORD_RESET_TOKEN_SECRET: `${namespace}-reset`,
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: smtp.port,
          SMTP_SECURE: false,
          SMTP_USER: 'local-test',
          SMTP_PASSWORD: 'local-test-password',
          SMTP_FROM: 'test@example.test',
          // Exercise the actual recovery dispatcher promptly in this fixture.
          PASSWORD_RESET_DELIVERY_POLL_SECONDS: 1,
          SMTP_DNS_TIMEOUT_MS: 250,
          SMTP_CONNECTION_TIMEOUT_MS: 250,
          SMTP_GREETING_TIMEOUT_MS: 250,
          SMTP_SOCKET_TIMEOUT_MS: 250,
        }),
      ),
    );
    // Configuration is the only override: actual HTTP guards, DB, SMTP and BullMQ.
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnvironmentService)
      .useValue(environment)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.listen(0, '127.0.0.1');
    const http = request(app.getHttpServer());
    await until(async () => (await http.get('/health/ready')).status === 200);
    const login = await http
      .post('/auth/login')
      .set('Origin', origin)
      .send({ email: 'admin@email-app.test', password })
      .expect(200);
    const cookie = login.headers['set-cookie']
      .map((value) => value.split(';')[0])
      .join('; ');
    const admin = (method, path) =>
      http[method](path).set('Origin', origin).set('Cookie', cookie);
    const invitation = async (userId) =>
      (
        await pool.query(
          'SELECT * FROM user_invitations WHERE user_id = $1 AND revoked_at IS NULL',
          [userId],
        )
      ).rows[0];
    const invite = async (email) =>
      (
        await admin('post', '/auth/invitations')
          .send({
            email,
            firstName: 'SMTP',
            lastName: 'Recipient',
            role: 'STUDENT',
          })
          .expect(201)
      ).body.detail;

    await t.test(
      'liveness, readiness, catalog and login work while SMTP never greets',
      async () => {
        await http.get('/health/live').expect(200);
        await http.get('/health/ready').expect(200);
        await http.get('/catalog/subjects').expect(200);
        await admin('get', '/auth/me').expect(200);
        assert.equal(
          smtp.connections,
          0,
          'API initialization must not verify or connect to SMTP',
        );
      },
    );

    await t.test(
      'invitation remains pending on timeout and BullMQ delivers it after SMTP recovery',
      async () => {
        const user = await invite('retry@email-app.test');
        await until(() => smtp.connections > 0);
        await http.get('/health/live').expect(200);
        await http.get('/health/ready').expect(200);
        const failed = await until(async () => {
          const row = await invitation(user.id);
          return row.delivery_attempts >= 1 && row;
        });
        assert.equal(failed.delivery_status, 'pending');
        assert.equal(failed.delivery_error, 'ETIMEDOUT');
        assert.equal(smtp.accepted, 0);
        smtp.mode = 'ready';
        const delivered = await until(async () => {
          const row = await invitation(user.id);
          return row.delivery_status === 'sent' && row;
        });
        assert(delivered.delivery_attempts >= 2);
        assert.equal(delivered.delivery_error, null);
        assert(delivered.delivered_at instanceof Date);
        assert.equal(smtp.accepted, 1);
      },
    );

    await t.test(
      'password reset retries a stalled final SMTP response and recovers on the same API',
      async () => {
        smtp.mode = 'data-stall';
        const accepted = smtp.accepted;
        await http
          .post('/auth/forgot-password')
          .set('Origin', origin)
          .send({ email: 'admin@email-app.test' })
          .expect(200);
        const reset = async () =>
          (await pool.query('SELECT * FROM password_resets')).rows[0];
        const failed = await until(async () => {
          const row = await reset();
          return row?.delivery_attempts >= 1 && row;
        });
        assert.equal(failed.delivery_status, 'pending');
        assert.equal(failed.delivery_error, 'ETIMEDOUT');
        await http.get('/health/ready').expect(200);
        smtp.mode = 'ready';
        const delivered = await until(async () => {
          const row = await reset();
          return row?.delivery_status === 'sent' && row;
        });
        assert(delivered.delivery_attempts >= 2);
        assert.equal(delivered.delivery_error, null);
        assert.equal(smtp.accepted, accepted + 1);
      },
    );

    await t.test(
      'five real failures exhaust retries safely; explicit resend works after recovery',
      async () => {
        smtp.mode = 'auth-reject';
        const user = await invite('exhausted@email-app.test');
        const failed = await until(async () => {
          const row = await invitation(user.id);
          return row.delivery_status === 'failed' && row;
        }, 25000);
        assert.equal(failed.delivery_attempts, 5);
        assert.equal(failed.delivery_error, 'EAUTH');
        assert.equal(failed.delivered_at, null);
        const listed = await admin('get', '/auth/users').expect(200);
        const visible = listed.body.detail.items.find(
          (row) => row.id === user.id,
        ).invitation;
        assert.equal(visible.status, 'failed');
        assert.equal(visible.attempts, 5);
        assert.equal(visible.errorCode, 'EAUTH');
        assert(!JSON.stringify(listed.body).includes('tokenHash'));
        const health = await admin('get', '/admin/delivery').expect(200);
        assert.equal(health.body.detail.status, 'warning');
        assert.equal(health.headers['cache-control'], 'no-store');
        await http.get('/admin/delivery').expect(401);
        await http.get('/health/ready').expect(200);
        smtp.mode = 'ready';
        const accepted = smtp.accepted;
        await admin('post', `/auth/invitations/${user.id}/resend`).expect(200);
        const delivered = await until(async () => {
          const row = await invitation(user.id);
          return row.delivery_status === 'sent' && row;
        });
        assert.notEqual(delivered.id, failed.id);
        assert.equal(delivered.delivery_attempts, 1);
        assert.equal(delivered.delivery_error, null);
        assert.equal(smtp.accepted, accepted + 1);
        assert.equal(
          (await admin('get', '/admin/delivery').expect(200)).body.detail
            .status,
          'ok',
        );
        const [manager] = await db
          .insert(users)
          .values({
            email: 'manager@email-app.test',
            firstName: 'Manager',
            lastName: 'Test',
            role: 'MANAGER',
            status: 'ACTIVE',
            passwordHash: await hash(password),
          })
          .returning();
        const managerLogin = await http
          .post('/auth/login')
          .set('Origin', origin)
          .send({ email: manager.email, password })
          .expect(200);
        const managerCookie = managerLogin.headers['set-cookie']
          .map((value) => value.split(';')[0])
          .join('; ');
        await http
          .get('/admin/delivery')
          .set('Cookie', managerCookie)
          .expect(403);
      },
    );
  },
);
