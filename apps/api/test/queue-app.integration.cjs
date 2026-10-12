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
const { getSharedConfigToken, getQueueToken } = require('@nestjs/bullmq');
const { ConfigService } = require('@nestjs/config');
const { Test } = require('@nestjs/testing');
const { createDatabase, createDatabaseUrl } = require('@project/database');
const { users } = require('@project/database/schema');
const { hash } = require('argon2');
const Redis = require('ioredis');
const request = require('supertest');

const { AppModule } = require('../dist/app.module');
const {
  AuthEmailProcessor,
} = require('../dist/auth/processors/auth-email.processor');
const {
  PasswordResetsService,
} = require('../dist/auth/services/password-resets.service');
const { EnvironmentService } = require('../dist/config/environment.service');
const {
  validateEnvironment,
} = require('../dist/config/environment.validation');
const { configureHttpApp } = require('../dist/config/http.config');
const {
  MediaCleanupProcessor,
} = require('../dist/media/processors/media-cleanup.processor');
const { redisRelay } = require('./helpers/redis-relay.cjs');
const { smtpServer } = require('./helpers/smtp-server.cjs');

async function until(check, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (true) {
    const result = await check();
    if (result) return result;
    assert(Date.now() < deadline, 'Timed out waiting for queue delivery state');
    await delay(25);
  }
}

test(
  'full API responds while Redis queues hang and delivers durable mail after recovery',
  { timeout: 60000 },
  async (t) => {
    for (const key of ['POSTGRES_HOST', 'REDIS_HOST'])
      assert(
        ['localhost', '127.0.0.1'].includes(process.env[key]),
        `${key}: local services only`,
      );
    // Close network peers after the app has stopped its workers and connections.
    const closeNetwork = [];
    const network = { after: (close) => closeNetwork.push(close) };
    const smtp = await smtpServer(network, 'ready');
    const relay = await redisRelay(network, 'stall');
    const namespace = `queue_app_${randomUUID().replaceAll('-', '')}`;
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
        relay.mode = 'ready';
        if (app) {
          // Finish bounded sends before Nest closes the database used by workers.
          await app.get(AuthEmailProcessor).worker.close();
          await app.get(MediaCleanupProcessor).worker.close(true);
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
        ]).finally(() => Promise.all(closeNetwork.map((close) => close())));
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
      email: 'admin@queue-app.test',
      firstName: 'SMTP',
      lastName: 'Test',
      status: 'ACTIVE',
      role: 'ADMIN',
      passwordHash: await hash(password),
    });
    await db.insert(users).values({
      email: 'reset@queue-app.test',
      firstName: 'Queue',
      lastName: 'Reset',
      status: 'ACTIVE',
      role: 'STUDENT',
      passwordHash: await hash(password),
    });
    directory = await mkdtemp(join(tmpdir(), 'edu-queue-app-'));
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
          REDIS_QUEUE_TIMEOUT_MS: 1500,
          INVITATION_DELIVERY_POLL_SECONDS: 1,
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
    // Override configuration only. Real queue producers/workers share the fault
    // relay, while the real limiter remains healthy so requests reach handlers.
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnvironmentService)
      .useValue(environment)
      .overrideProvider(getSharedConfigToken())
      .useValue({
        prefix: namespace,
        connection: { host: '127.0.0.1', port: relay.port },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.listen(0, '127.0.0.1');
    const queueErrors = [];
    for (const name of ['email', 'media'])
      app
        .get(getQueueToken(name))
        .on('error', (error) => queueErrors.push(error));
    for (const processor of [AuthEmailProcessor, MediaCleanupProcessor])
      app.get(processor).worker.on('error', (error) => queueErrors.push(error));
    const http = request(app.getHttpServer());
    await until(async () => (await http.get('/health/ready')).status === 200);
    const login = await http
      .post('/auth/login')
      .set('Origin', origin)
      .send({ email: 'admin@queue-app.test', password })
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
    const prompt = async (operation) => {
      const started = Date.now();
      const response = await operation.timeout({
        response: 1000,
        deadline: 1200,
      });
      assert(
        Date.now() - started < 1000,
        'HTTP must finish before the 1500ms queue deadline',
      );
      return response;
    };
    const pendingInvite = async (email) => {
      const response = await prompt(
        admin('post', '/auth/invitations')
          .send({
            email,
            firstName: 'Queue',
            lastName: 'Recipient',
            role: 'STUDENT',
          })
          .expect(201),
      );
      const row = await invitation(response.body.detail.id);
      assert.equal(row.delivery_status, 'pending');
      assert.equal(row.delivery_attempts, 0);
      return { user: response.body.detail, row };
    };
    const resetFor = async (email) =>
      (
        await pool.query(
          'SELECT r.* FROM password_resets r JOIN users u ON u.id = r.user_id WHERE u.email = $1 ORDER BY r.created_at DESC',
          [email],
        )
      ).rows[0];
    let current, revoked;

    await t.test(
      'cold queue outage does not block startup, health, catalog, invite or resend',
      async () => {
        await http.get('/health/live').expect(200);
        await http.get('/health/ready').expect(200);
        await http.get('/catalog/subjects').expect(200);
        const initial = await pendingInvite('cold@queue-app.test');
        revoked = initial.row;
        await prompt(
          admin('post', `/auth/invitations/${initial.user.id}/resend`).expect(
            200,
          ),
        );
        current = await invitation(initial.user.id);
        assert.notEqual(current.id, revoked.id);
        assert(
          (
            await pool.query(
              'SELECT revoked_at FROM user_invitations WHERE id = $1',
              [revoked.id],
            )
          ).rows[0].revoked_at,
        );
        assert.equal(smtp.accepted, 0);
      },
    );

    await t.test(
      'password recovery and change commit while queue is hung; mail stays pending',
      async () => {
        for (const email of ['admin@queue-app.test', 'reset@queue-app.test'])
          await prompt(
            http
              .post('/auth/forgot-password')
              .set('Origin', origin)
              .send({ email })
              .expect(200),
          );
        const reset = await resetFor('reset@queue-app.test');
        const token = app.get(PasswordResetsService).deliveryToken(reset.id);
        await prompt(
          http
            .post('/auth/reset-password')
            .set('Origin', origin)
            .send({
              token,
              password: 'Changed-queue-test-password!',
            })
            .expect(200),
        );
        const changed = await resetFor('reset@queue-app.test');
        assert(changed.used_at instanceof Date);
        assert.equal(changed.notification_status, 'pending');
        await delay(1800); // Let at least one queue attempt exhaust its deadline.
        assert.equal(
          (await resetFor('admin@queue-app.test')).delivery_status,
          'pending',
        );
        assert.equal(
          (await invitation(current.user_id)).delivery_status,
          'pending',
        );
        assert.equal(smtp.accepted, 0);
        assert(relay.blocked > 0);
      },
    );

    await t.test(
      'same API and workers resume all pending mail and media scheduling after Redis recovers',
      async () => {
        relay.mode = 'ready';
        await until(async () => {
          const reset = await resetFor('admin@queue-app.test');
          const changed = await resetFor('reset@queue-app.test');
          return (
            (await invitation(current.user_id)).delivery_status === 'sent' &&
            reset.delivery_status === 'sent' &&
            changed.notification_status === 'sent'
          );
        }, 12000);
        assert.equal(
          smtp.accepted,
          3,
          'latest invitation, reset link and password-change notice',
        );
        const old = (
          await pool.query('SELECT * FROM user_invitations WHERE id = $1', [
            revoked.id,
          ])
        ).rows[0];
        assert.equal(old.delivery_status, 'skipped');
        assert.equal(
          (await resetFor('reset@queue-app.test')).delivery_status,
          'skipped',
        );
        await until(
          async () =>
            !!(await app
              .get(getQueueToken('media'))
              .getJobScheduler('cleanup')),
          12000,
        );
        await delay(1100); // Next outbox scan must not send already delivered mail again.
        assert.equal(smtp.accepted, 3);
      },
    );

    await t.test(
      'stalled established queue connections time out, HTTP stays fast and delivery recovers',
      async () => {
        relay.mode = 'stall';
        const { user } = await pendingInvite('warm@queue-app.test');
        await delay(1800);
        assert.equal((await invitation(user.id)).delivery_status, 'pending');
        relay.mode = 'ready';
        await until(
          async () => (await invitation(user.id)).delivery_status === 'sent',
        );
        assert.equal(smtp.accepted, 4);
      },
    );

    await t.test(
      'disconnected Redis queues retain committed invites and reconnect automatically',
      async () => {
        relay.mode = 'refuse';
        relay.disconnect();
        const { user } = await pendingInvite('disconnect@queue-app.test');
        await delay(1800);
        assert.equal((await invitation(user.id)).delivery_status, 'pending');
        relay.mode = 'ready';
        await until(
          async () => (await invitation(user.id)).delivery_status === 'sent',
          12000,
        );
        assert.equal(smtp.accepted, 5);
        await http.get('/health/ready').expect(200);
      },
    );
    for (const error of queueErrors)
      assert(
        ['ECONNRESET', 'EPIPE', 'ECONNREFUSED'].includes(error.code) ||
          /Connection is closed|Connection closed|connect/i.test(error.message),
        `Unexpected queue error: ${error.message}`,
      );
  },
);
