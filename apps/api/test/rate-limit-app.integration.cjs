const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { connect, createServer } = require('node:net');
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
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const request = require('supertest');

const { AppModule } = require('../dist/app.module');
const { AuthService } = require('../dist/auth/auth.service');
const {
  AuthEmailProcessor,
} = require('../dist/auth/processors/auth-email.processor');
const {
  SubjectsService,
} = require('../dist/catalog/services/subjects.service');
const { EnvironmentService } = require('../dist/config/environment.service');
const {
  validateEnvironment,
} = require('../dist/config/environment.validation');
const { configureHttpApp } = require('../dist/config/http.config');
const { DatabaseService } = require('../dist/database/database.service');
const {
  RedisThrottlerStorage,
} = require('../dist/infrastructure/rate-limit/redis-throttler.storage');
const {
  MediaCleanupProcessor,
} = require('../dist/media/processors/media-cleanup.processor');
const {
  PermissionsService,
} = require('../dist/permissions/permissions.service');

async function until(check, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    assert(Date.now() < deadline, 'Full application did not become ready');
    await delay(30);
  }
}

// No controller, guard, storage, database, queue or authentication replacements.
// Only configuration is overridden to point both full AppModules at owned resources.
test(
  'global rate limiting through two complete applications',
  { timeout: 60000 },
  async (t) => {
    const env = process.env;
    for (const key of ['POSTGRES_HOST', 'REDIS_HOST'])
      assert(
        ['localhost', '127.0.0.1'].includes(env[key]),
        `${key}: local services only`,
      );
    const namespace = `rate_app_${randomUUID().replaceAll('-', '')}`;
    const origin = 'http://localhost:3001';
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
    const apps = [];
    const sockets = new Set();
    let online = true;
    const relay = createServer((socket) => {
      if (!online) return socket.destroy();
      const upstream = connect({
        host: env.REDIS_HOST,
        port: Number(env.REDIS_PORT),
      });
      for (const stream of [socket, upstream]) {
        sockets.add(stream);
        stream.on('error', () => undefined);
      }
      socket.on('close', () => {
        sockets.delete(socket);
        upstream.destroy();
      });
      upstream.on('close', () => {
        sockets.delete(upstream);
        socket.destroy();
      });
      socket.pipe(upstream).pipe(socket);
    });
    // Never use SMTP credentials from .env; no test sends real mail.
    const smtp = createServer((socket) =>
      socket.end('421 Test mail disabled\r\n'),
    );
    let directory,
      createdSchema = false;
    t.after(async () => {
      online = true;
      try {
        // The outage interrupts BullMQ's blocking reads as well. Stop these
        // owned test workers without waiting for their polling loop to resume.
        await Promise.all(
          apps.flatMap(({ app }) =>
            [AuthEmailProcessor, MediaCleanupProcessor].map((processor) =>
              app.get(processor).worker.close(true),
            ),
          ),
        );
        await Promise.all(apps.map(({ app }) => app.close()));
      } finally {
        for (const socket of sockets) socket.destroy();
        await Promise.all([
          new Promise((res) => relay.close(res)),
          new Promise((res) => smtp.close(res)),
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
    const password = 'Full-app-rate-test-password!';
    const passwordHash = await hash(password);
    await db.insert(users).values(
      ['ADMIN', 'MANAGER'].map((role) => ({
        email: `${role.toLowerCase()}@rate-app.test`,
        firstName: role,
        lastName: 'Rate test',
        status: 'ACTIVE',
        role,
        passwordHash,
      })),
    );
    directory = await mkdtemp(join(tmpdir(), 'edu-rate-app-'));
    relay.listen(0, '127.0.0.1');
    await once(relay, 'listening');
    smtp.listen(0, '127.0.0.1');
    await once(smtp, 'listening');
    const environment = new EnvironmentService(
      new ConfigService(
        validateEnvironment({
          ...env,
          NODE_ENV: 'test',
          LOG_LEVEL: 'silent',
          FRONTEND_ORIGIN: origin,
          POSTGRES_SCHEMA: namespace,
          REDIS_QUEUE_PREFIX: namespace,
          REDIS_HOST: '127.0.0.1',
          REDIS_PORT: relay.address().port,
          RATE_LIMIT_REDIS_PREFIX: `${namespace}:limits`,
          RATE_LIMIT_REDIS_TIMEOUT_MS: 200,
          TRUSTED_PROXIES: '127.0.0.1/32,::1/128',
          HEALTH_CHECK_TIMEOUT_MS: 200,
          STORAGE_DRIVER: 'local',
          STORAGE_LOCAL_ROOT: directory,
          ACCESS_JWT_SECRET: `${namespace}-access`,
          INVITATION_TOKEN_SECRET: `${namespace}-invite`,
          PASSWORD_RESET_TOKEN_SECRET: `${namespace}-reset`,
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: smtp.address().port,
          SMTP_SECURE: false,
          SMTP_USER: 'test',
          SMTP_PASSWORD: 'test',
          SMTP_FROM: 'test@example.test',
        }),
      ),
    );
    for (let i = 0; i < 2; i++) {
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(EnvironmentService)
        .useValue(environment)
        .compile();
      const app = module.createNestApplication({ logger: false });
      const instance = { app };
      apps.push(instance);
      configureHttpApp(app);
      await app.listen(0, '127.0.0.1');
      instance.http = request(app.getHttpServer());
      await until(
        async () => (await instance.http.get('/health/ready')).status === 200,
      );
    }
    const [a, b] = apps;
    let client = 1;
    const nextIP = () => `198.51.100.${client++}`;
    function hit(instance, method, path, ip, cookie) {
      const req = instance.http[method](path)
        .set('X-Forwarded-For', ip)
        .set('Origin', origin);
      return cookie ? req.set('Cookie', cookie) : req;
    }
    async function login(role) {
      const response = await hit(a, 'post', '/auth/login', nextIP())
        .send({ email: `${role}@rate-app.test`, password })
        .expect(200);
      assert.equal(
        response.headers['x-ratelimit-remaining'],
        '4',
        'login counted exactly once',
      );
      return response.headers['set-cookie']
        .map((cookie) => cookie.split(';')[0])
        .join('; ');
    }
    const admin = await login('admin');
    const manager = await login('manager');
    function assertBlocked(response) {
      assert.equal(response.status, 429);
      assert.equal(response.body.status_code, 429);
      assert.equal(response.body.result, 'error');
      assert(Number(response.headers['retry-after']) > 0);
      assert(Number(response.headers['retry-after']) <= 60);
      assert(
        response.headers['access-control-expose-headers'].includes(
          'Retry-After',
        ),
      );
    }
    // Exact remaining budgets catch accidental global + controller double counting.
    async function exhaust({
      method = 'get',
      path,
      limit = 60,
      status = 200,
      cookie,
      data,
      upload,
    }) {
      const ip = nextIP();
      for (let i = 0; i <= limit; i++) {
        let req = hit(i % 2 ? b : a, method, path, ip, cookie);
        if (upload) req = req.attach('file', upload.body, upload.name);
        else if (data !== undefined) req = req.send(data);
        const response = await req;
        if (i === limit) assertBlocked(response);
        else {
          assert.equal(
            response.status,
            status,
            `${method} ${path}: ${JSON.stringify(response.body)}`,
          );
          assert.equal(
            response.headers['x-ratelimit-limit'],
            String(limit),
            path,
          );
          assert.equal(
            response.headers['x-ratelimit-remaining'],
            String(limit - i - 1),
            path,
          );
        }
      }
      return ip;
    }

    await t.test(
      'every public catalog route has the shared default budget',
      async () => {
        for (const [path, status] of [
          ['/catalog/subjects', 200],
          ['/catalog/teachers', 200],
          ['/catalog/subjects/missing', 404],
          ['/catalog/subjects/missing/teachers', 404],
          ['/catalog/teachers/missing', 404],
          ['/catalog/teachers/missing/photo', 404],
        ])
          await exhaust({ path, status });
        // A different client gets a fresh budget; query strings cannot reset one.
        const ip = await exhaust({ path: '/catalog/subjects?limit=1' });
        assertBlocked(await hit(b, 'get', '/catalog/subjects?limit=2', ip));
        await hit(b, 'get', '/catalog/subjects', nextIP()).expect(200);
        const slugIP = await exhaust({
          path: '/catalog/subjects/first',
          status: 404,
        });
        assertBlocked(await hit(b, 'get', '/catalog/subjects/second', slugIP));
      },
    );

    await t.test(
      'admin catalog reads and every write route inherit the default limit',
      async () => {
        const missing = randomUUID();
        for (const resource of ['subjects', 'teachers']) {
          const base = `/admin/${resource}`;
          for (const [method, path, status, data] of [
            ['get', base, 200],
            ['get', `${base}/${missing}`, 404],
            ['post', base, 400, {}],
            ['patch', `${base}/${missing}`, 400, {}],
            ['patch', `${base}/${missing}/status`, 400, {}],
            ['delete', `${base}/${missing}`, 404, { expectedVersion: 1 }],
          ])
            await exhaust({ method, path, status, data, cookie: admin });
        }
        await exhaust({
          path: `/admin/teachers/${missing}/subjects`,
          status: 404,
          cookie: admin,
        });
        await exhaust({
          method: 'put',
          path: `/admin/teachers/${missing}/subjects`,
          status: 400,
          data: {},
          cookie: admin,
        });
      },
    );

    await t.test(
      'auth retains 20/min and all sensitive route overrides retain 5/min',
      async () => {
        await exhaust({ path: '/auth/me', limit: 20, cookie: admin });
        for (const path of [
          '/auth/login',
          '/auth/invitations/accept',
          '/auth/forgot-password',
          '/auth/reset-password',
        ])
          await exhaust({
            method: 'post',
            path,
            limit: 5,
            status: 400,
            data: {},
          });
        await exhaust({
          method: 'post',
          path: '/auth/login',
          limit: 5,
          status: 401,
          data: {
            email: 'admin@rate-app.test',
            password: 'Incorrect password!',
          },
        });
      },
    );

    await t.test(
      'real image/PDF uploads retain 10/min; other media operations retain 60/min',
      async () => {
        const image = await sharp({
          create: { width: 32, height: 32, channels: 3, background: '#336699' },
        })
          .png()
          .toBuffer();
        const pdf = await PDFDocument.create();
        pdf.addPage();
        for (const [path, body, name] of [
          ['/admin/media/images', image, 'test.png'],
          ['/admin/media/pdfs', Buffer.from(await pdf.save()), 'test.pdf'],
        ])
          await exhaust({
            method: 'post',
            path,
            limit: 10,
            status: 201,
            cookie: admin,
            upload: { body, name },
          });
        for (const [method, path] of [
          ['get', `/admin/media/${randomUUID()}`],
          ['get', `/admin/media/${randomUUID()}/content`],
          ['delete', `/admin/media/${randomUUID()}`],
        ])
          await exhaust({ method, path, status: 404, cookie: admin });
      },
    );

    await t.test(
      '429 precedes authentication, permissions and validation without skipping their normal checks',
      async () => {
        const auth = a.app.get(AuthService);
        const authentication = t.mock.method(auth, 'authenticate');
        const ip = nextIP();
        try {
          for (let i = 0; i < 20; i++)
            await hit(a, 'get', '/auth/me', ip, 'access_token=invalid').expect(
              401,
            );
          const before = authentication.mock.calls.length;
          assertBlocked(
            await hit(a, 'get', '/auth/me', ip, 'access_token=invalid'),
          );
          assert.equal(
            authentication.mock.calls.length,
            before,
            'blocked request must not authenticate',
          );
          assert.equal(before, 20);
        } finally {
          authentication.mock.restore();
        }
        const permissions = t.mock.method(
          a.app.get(PermissionsService),
          'require',
        );
        const forbiddenIP = nextIP();
        try {
          for (let i = 0; i < 10; i++)
            await hit(
              a,
              'post',
              '/admin/media/images',
              forbiddenIP,
              manager,
            ).expect(403);
          const before = permissions.mock.calls.length;
          assertBlocked(
            await hit(a, 'post', '/admin/media/images', forbiddenIP, manager),
          );
          assert.equal(permissions.mock.calls.length, before);
          assert.equal(before, 10);
        } finally {
          permissions.mock.restore();
        }
        await hit(a, 'post', '/admin/subjects', nextIP(), admin)
          .set('Origin', 'https://untrusted.example')
          .send({})
          .expect(403);
      },
    );

    await t.test(
      'all health routes bypass counters, auth and rate headers even after many probes',
      async () => {
        const increment = t.mock.method(
          a.app.get(RedisThrottlerStorage),
          'increment',
        );
        try {
          for (const path of ['/health/live', '/health/ready', '/health']) {
            for (let i = 0; i < 65; i++) {
              const response = await hit(
                a,
                'get',
                path,
                '198.51.100.250',
                'access_token=invalid',
              ).expect(200);
              assert.equal(response.headers['x-ratelimit-limit'], undefined);
              assert.equal(response.headers['retry-after'], undefined);
              assert.equal(response.headers['cache-control'], 'no-store');
            }
          }
          assert.equal(increment.mock.calls.length, 0);
        } finally {
          increment.mock.restore();
        }
        const database = t.mock.method(
          a.app.get(DatabaseService),
          'checkHealth',
        );
        const redisHealth = t.mock.method(
          a.app.get(RedisThrottlerStorage),
          'checkHealth',
        );
        try {
          await a.http.get('/health/live').expect(200);
          assert.equal(database.mock.calls.length, 0);
          assert.equal(redisHealth.mock.calls.length, 0);
        } finally {
          database.mock.restore();
          redisHealth.mock.restore();
        }
      },
    );

    await t.test(
      'Redis outage fails catalog closed while health reports dependency status and later recovers',
      async () => {
        const list = t.mock.method(a.app.get(SubjectsService), 'list');
        const auth = t.mock.method(a.app.get(AuthService), 'authenticate');
        try {
          online = false;
          for (const socket of sockets) socket.destroy();
          await delay(30);
          for (const path of [
            '/catalog/subjects',
            '/admin/subjects',
            '/auth/me',
          ]) {
            const response = await hit(a, 'get', path, nextIP(), admin).expect(
              503,
            );
            assert.equal(response.body.result, 'error');
          }
          assert.equal(list.mock.calls.length, 0);
          assert.equal(auth.mock.calls.length, 0);
          await a.http.get('/health/live').expect(200);
          for (const path of ['/health/ready', '/health']) {
            const response = await a.http.get(path).expect(503);
            assert.deepEqual(response.body.detail.checks, {
              postgresql: 'up',
              redis: 'down',
            });
            assert.equal(response.headers['x-ratelimit-limit'], undefined);
          }
        } finally {
          online = true;
          list.mock.restore();
          auth.mock.restore();
          await until(
            async () => (await a.http.get('/health/ready')).status === 200,
          );
          await until(
            async () => (await b.http.get('/health/ready')).status === 200,
          );
        }
        await hit(a, 'get', '/catalog/subjects', nextIP()).expect(200);
        await hit(b, 'get', '/admin/subjects', nextIP(), admin).expect(200);
      },
    );
  },
);
