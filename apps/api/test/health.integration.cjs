const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { connect, createServer } = require('node:net');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

require('reflect-metadata');
const databaseRequire = createRequire(
  resolve('../../packages/database/package.json'),
);
databaseRequire('dotenv').config({ path: '../../.env', quiet: true });
const { Reflector } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { Test } = require('@nestjs/testing');
const { createDatabaseUrl } = require('@project/database');
const request = require('supertest');

const {
  AllExceptionFilter,
} = require('../dist/common/filters/all-exception.filter');
const { AuthGuard } = require('../dist/common/guards/auth.guard');
const { CsrfGuard } = require('../dist/common/guards/csrf.guard');
const {
  ResponseInterceptor,
} = require('../dist/common/interceptors/response.interceptor');
const { EnvironmentService } = require('../dist/config/environment.service');
const {
  validateEnvironment,
} = require('../dist/config/environment.validation');
const { DatabaseService } = require('../dist/database/database.service');
const { HealthModule } = require('../dist/health/health.module');
const {
  RedisThrottlerStorage,
} = require('../dist/infrastructure/rate-limit/redis-throttler.storage');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function until(check, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    assert(Date.now() < deadline, 'Health state did not converge');
    await delay(20);
  }
}

async function createApp(environment, overrides = {}) {
  let builder = Test.createTestingModule({ imports: [HealthModule] })
    .overrideProvider(EnvironmentService)
    .useValue(environment);
  if (overrides.database)
    builder = builder
      .overrideProvider(DatabaseService)
      .useValue(overrides.database);
  if (overrides.redis)
    builder = builder
      .overrideProvider(RedisThrottlerStorage)
      .useValue(overrides.redis);
  const module = await builder.compile();
  const app = module.createNestApplication({ logger: false });
  let authCalls = 0;
  app.useGlobalGuards(
    new CsrfGuard(environment),
    new AuthGuard(new Reflector(), {
      authenticate: () => {
        authCalls++;
        throw new Error('Health must be public');
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.listen(0, '127.0.0.1');
  return {
    app,
    http: request(app.getHttpServer()),
    authCalls: () => authCalls,
  };
}

function expectReadiness(response, postgresql, redis) {
  const ready = postgresql === 'up' && redis === 'up';
  assert.equal(response.status, ready ? 200 : 503);
  assert.deepEqual(response.body, {
    status_code: ready ? 200 : 503,
    detail: {
      status: ready ? 'ready' : 'not_ready',
      checks: { postgresql, redis },
    },
    result: ready ? 'success' : 'error',
  });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-ratelimit-limit'], undefined);
}

test('health timeout is validated with a safe default', () => {
  const env = { ...process.env };
  delete env.HEALTH_CHECK_TIMEOUT_MS;
  assert.equal(validateEnvironment(env).HEALTH_CHECK_TIMEOUT_MS, 1000);
  for (const value of [99, 5001, 0, -1, 'invalid', 100.5]) {
    assert.throws(
      () => validateEnvironment({ ...env, HEALTH_CHECK_TIMEOUT_MS: value }),
      /HEALTH_CHECK_TIMEOUT_MS/,
    );
  }
  for (const value of [100, 5000]) {
    assert.equal(
      validateEnvironment({ ...env, HEALTH_CHECK_TIMEOUT_MS: String(value) })
        .HEALTH_CHECK_TIMEOUT_MS,
      value,
    );
  }
});

test(
  'health HTTP contract, public guards, deadlines and coalescing',
  { timeout: 10000 },
  async (t) => {
    let databaseCalls = 0,
      redisCalls = 0;
    let databaseProbe = async () => {};
    let redisProbe = async () => {};
    const instance = await createApp(
      { healthCheckTimeoutMs: 150, trustedRequestOrigins: [] },
      {
        database: {
          checkHealth: (timeout) => {
            assert.equal(timeout, 150);
            databaseCalls++;
            return databaseProbe();
          },
        },
        redis: {
          checkHealth: () => {
            redisCalls++;
            return redisProbe();
          },
        },
      },
    );
    t.after(() => instance.app.close());

    await t.test(
      'liveness is public and independent of either dependency',
      async () => {
        databaseProbe = redisProbe = () => {
          throw new Error('must not be called');
        };
        const response = await instance.http
          .get('/health/live')
          .set('Cookie', 'access_token=invalid')
          .set('Origin', 'https://untrusted.example')
          .expect(200);
        assert.deepEqual(response.body, {
          status_code: 200,
          detail: { status: 'ok' },
          result: 'success',
        });
        assert.equal(response.headers['cache-control'], 'no-store');
        await instance.http.head('/health/live').expect(200);
        assert.equal(databaseCalls, 0);
        assert.equal(redisCalls, 0);
        assert.equal(instance.authCalls(), 0);
      },
    );

    await t.test(
      'readiness checks both services, including the legacy route, without leaking errors',
      async () => {
        for (const [postgresql, redis] of [
          ['up', 'up'],
          ['down', 'up'],
          ['up', 'down'],
          ['down', 'down'],
          ['up', 'up'],
        ]) {
          databaseProbe = () =>
            postgresql === 'up'
              ? Promise.resolve()
              : Promise.reject(
                  new Error(
                    'secret postgres://user:password@private-host/database SELECT detail',
                  ),
                );
          redisProbe = () => {
            if (redis === 'down')
              throw new Error('secret redis://password@private-host');
            return Promise.resolve();
          };
          for (const path of ['/health/ready', '/health']) {
            const response = await instance.http
              .get(path)
              .set('Cookie', 'access_token=invalid');
            expectReadiness(response, postgresql, redis);
            assert(!JSON.stringify(response.body).includes('secret'));
          }
        }
        assert.equal(databaseCalls, 10);
        assert.equal(redisCalls, 10);
        assert.equal(instance.authCalls(), 0);
      },
    );

    await t.test(
      'parallel probes share a pair of simultaneous checks, with no completed-result cache',
      async () => {
        const gate = deferred();
        databaseProbe = redisProbe = () => gate.promise;
        const before = [databaseCalls, redisCalls];
        const pending = Promise.all(
          Array.from({ length: 12 }, () => instance.http.get('/health/ready')),
        );
        await until(() => databaseCalls > before[0] && redisCalls > before[1]);
        assert.deepEqual(
          [databaseCalls, redisCalls],
          before.map((n) => n + 1),
        );
        gate.resolve();
        for (const response of await pending)
          expectReadiness(response, 'up', 'up');
        databaseProbe = () => Promise.reject(new Error('down after success'));
        expectReadiness(await instance.http.get('/health/ready'), 'down', 'up');
        assert.deepEqual(
          [databaseCalls, redisCalls],
          before.map((n) => n + 2),
        );
      },
    );

    await t.test(
      'hung checks return 503 within one deadline; liveness remains responsive',
      async () => {
        const pgGate = deferred(),
          redisGate = deferred();
        databaseProbe = () => pgGate.promise;
        redisProbe = () => redisGate.promise;
        const started = Date.now();
        const pending = instance.http.get('/health/ready').then((r) => r);
        await delay(20);
        await instance.http.get('/health/live').expect(200);
        expectReadiness(await pending, 'down', 'down');
        const elapsed = Date.now() - started;
        assert(elapsed >= 100 && elapsed < 600, `deadline took ${elapsed}ms`);
        // A rejection after the HTTP deadline is still consumed, never unhandled.
        pgGate.reject(new Error('late failure'));
        redisGate.resolve();
        databaseProbe = redisProbe = async () => {};
        expectReadiness(await instance.http.get('/health/ready'), 'up', 'up');
      },
    );

    await t.test(
      'Swagger describes distinct live/ready responses and 503 dependency status',
      () => {
        const doc = SwaggerModule.createDocument(
          instance.app,
          new DocumentBuilder().build(),
        );
        for (const path of ['/health', '/health/ready', '/health/live']) {
          assert(doc.paths[path].get.responses['200']);
          assert.equal(doc.paths[path].get.security, undefined);
        }
        assert(doc.paths['/health/ready'].get.responses['503']);
        assert.equal(doc.paths['/health/live'].get.responses['503'], undefined);
        const dto = doc.components.schemas.ReadinessResponseDto;
        assert.deepEqual(dto.properties.status.enum, ['ready', 'not_ready']);
        assert.deepEqual(dto.properties.checks.required, [
          'postgresql',
          'redis',
        ]);
      },
    );
  },
);

async function startRelay(host, port) {
  let mode = 'online';
  const sockets = new Set();
  const server = createServer((socket) => {
    if (mode === 'offline') {
      socket.destroy();
      return;
    }
    const upstream = connect({ host, port });
    sockets.add(socket);
    sockets.add(upstream);
    socket.on('error', () => {});
    upstream.on('error', () => {});
    socket.on('close', () => {
      sockets.delete(socket);
      upstream.destroy();
    });
    upstream.on('close', () => {
      sockets.delete(upstream);
      socket.destroy();
    });
    socket.pipe(upstream).pipe(socket);
    if (mode === 'stalled') {
      socket.pause();
      upstream.pause();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    mode(next) {
      mode = next;
      for (const socket of sockets) {
        if (next === 'offline') socket.destroy();
        else if (next === 'stalled') socket.pause();
        else socket.resume();
      }
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test(
  'real PostgreSQL/Redis health probes recover without restarting the API',
  { timeout: 20000 },
  async (t) => {
    const env = process.env;
    for (const host of [env.POSTGRES_HOST, env.REDIS_HOST]) {
      assert(
        ['localhost', '127.0.0.1', '::1'].includes(host),
        'Local dependencies only',
      );
    }
    const relays = [],
      apps = [];
    t.after(async () => {
      // Close HTTP/apps before the relays so pool/Redis cleanup can complete normally.
      await Promise.all(apps.map((app) => app.close()));
      await Promise.all(relays.map((relay) => relay.close()));
    });
    const pgRelay = await startRelay(
      env.POSTGRES_HOST,
      Number(env.POSTGRES_PORT),
    );
    relays.push(pgRelay);
    const redisRelay = await startRelay(env.REDIS_HOST, Number(env.REDIS_PORT));
    relays.push(redisRelay);
    const environment = {
      databaseUrl: createDatabaseUrl({
        host: '127.0.0.1',
        port: pgRelay.port,
        user: env.POSTGRES_USER,
        password: env.POSTGRES_PASSWORD,
        database: env.POSTGRES_DB,
        schema: env.POSTGRES_SCHEMA,
      }),
      healthCheckTimeoutMs: 150,
      redisHost: '127.0.0.1',
      redisPort: redisRelay.port,
      rateLimitRedisTimeoutMs: 300,
      rateLimitRedisPrefix: 'test:health:no-writes',
    };
    pgRelay.mode('offline');
    redisRelay.mode('offline');
    const instance = await createApp(environment);
    apps.push(instance.app);
    const database = instance.app.get(DatabaseService);
    const pool = database.connection.pool;
    // A small application pool makes exhaustion observable without many connections.
    pool.options.max = 2;
    const ready = () => instance.http.get('/health/ready');
    const recover = async () => {
      pgRelay.mode('online');
      redisRelay.mode('online');
      await until(async () => (await ready()).status === 200, 7000);
      expectReadiness(await ready(), 'up', 'up');
    };

    await t.test(
      'HTTP starts while dependencies are down; liveness succeeds and readiness fails',
      async () => {
        await instance.http.get('/health/live').expect(200);
        expectReadiness(await ready(), 'down', 'down');
        await recover();
      },
    );

    await t.test(
      'a dropped PostgreSQL connection changes readiness and later reconnects',
      async () => {
        pgRelay.mode('offline');
        await delay(25);
        expectReadiness(await ready(), 'down', 'up');
        await instance.http.get('/health/live').expect(200);
        await recover();
      },
    );

    await t.test(
      'Redis loss changes readiness and reconnects without touching rate limit counters',
      async () => {
        redisRelay.mode('offline');
        await delay(25);
        expectReadiness(await ready(), 'up', 'down');
        await instance.http.get('/health/live').expect(200);
        await recover();
      },
    );

    await t.test(
      'a recovered Redis connection stays healthy beyond the previous socket deadline',
      async () => {
        const client = instance.app.get(RedisThrottlerStorage).redis;
        let closes = 0;
        const onClose = () => {
          closes++;
        };
        client.on('close', onClose);
        try {
          await delay(environment.rateLimitRedisTimeoutMs * 2 + 100);
          expectReadiness(await ready(), 'up', 'up');
          assert.equal(
            closes,
            0,
            'no stale timeout may close a replacement connection',
          );
        } finally {
          client.off('close', onClose);
        }
      },
    );

    await t.test(
      'exhausted PostgreSQL pool fails within deadline, with at most one queued health acquisition',
      async () => {
        const clients = await Promise.all([pool.connect(), pool.connect()]);
        try {
          const start = Date.now();
          expectReadiness(await ready(), 'down', 'up');
          assert(Date.now() - start < 600);
          for (const response of await Promise.all(
            Array.from({ length: 10 }, ready),
          )) {
            expectReadiness(response, 'down', 'up');
          }
          assert.equal(pool.waitingCount, 1);
        } finally {
          for (const client of clients) client.release();
        }
        await recover();
        assert.equal(pool.waitingCount, 0);
        assert.equal(pool.idleCount, pool.totalCount);
      },
    );

    await t.test(
      'a stalled PostgreSQL query destroys its connection and frees the pool',
      async () => {
        const total = pool.totalCount;
        pgRelay.mode('stalled');
        const start = Date.now();
        expectReadiness(await ready(), 'down', 'up');
        assert(Date.now() - start < 600);
        await until(() => pool.totalCount < total);
        await recover();
        assert.equal(pool.waitingCount, 0);
        assert.equal(pool.idleCount, pool.totalCount);
      },
    );

    await t.test(
      'Redis stall honors the HTTP deadline, shares one pending PING and later recovers',
      async () => {
        redisRelay.mode('stalled');
        const start = Date.now();
        const pending = instance.http.get('/health/ready').then((r) => r);
        await delay(20);
        await instance.http.get('/health/live').expect(200);
        expectReadiness(await pending, 'up', 'down');
        assert(Date.now() - start >= 100 && Date.now() - start < 600);
        // The client timeout is longer than the HTTP deadline: reuse its pending PING.
        const storage = instance.app.get(RedisThrottlerStorage);
        const first = storage.checkHealth();
        assert.equal(first, storage.checkHealth());
        void first.catch(() => {});
        await recover();
      },
    );
  },
);
