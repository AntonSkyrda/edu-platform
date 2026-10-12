const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

require('reflect-metadata');
const databaseRequire = createRequire(
  resolve('../../packages/database/package.json'),
);
databaseRequire('dotenv').config({ path: '../../.env', quiet: true });
const { Controller, Get, Req, UseGuards } = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const { Throttle, ThrottlerGuard } = require('@nestjs/throttler');
const { Redis } = require('ioredis');
const request = require('supertest');

const {
  AllExceptionFilter,
} = require('../dist/common/filters/all-exception.filter');
const { EnvironmentService } = require('../dist/config/environment.service');
const {
  validateEnvironment,
} = require('../dist/config/environment.validation');
const {
  configureTrustedProxies,
  parseTrustedProxies,
} = require('../dist/config/proxy.config');
const {
  RateLimitModule,
} = require('../dist/infrastructure/rate-limit/rate-limit.module');
const {
  RedisThrottlerStorage,
} = require('../dist/infrastructure/rate-limit/redis-throttler.storage');

class ProbeController {
  calls = 0;
  burst(req) {
    this.calls++;
    return { ip: req.ip };
  }
  other(req) {
    return { ip: req.ip };
  }
  standard(req) {
    return { ip: req.ip };
  }
}
Controller('probe')(ProbeController);
UseGuards(ThrottlerGuard)(ProbeController);
for (const name of ['burst', 'other', 'standard']) {
  const descriptor = Object.getOwnPropertyDescriptor(
    ProbeController.prototype,
    name,
  );
  Get(name)(ProbeController.prototype, name, descriptor);
  Req()(ProbeController.prototype, name, 0);
  if (name !== 'standard') {
    Throttle({ default: { limit: 5, ttl: 60000 } })(
      ProbeController.prototype,
      name,
      descriptor,
    );
  }
}

async function until(check, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (true) {
    if (await check()) return;
    assert(Date.now() < deadline, 'Timed out waiting for Redis state');
    await delay(15);
  }
}

// These integration tests must never touch a remote Redis or flush any database.
test('proxy configuration rejects implicit or universal trust', () => {
  assert.deepEqual(parseTrustedProxies(''), []);
  assert.deepEqual(parseTrustedProxies('  '), []);
  assert.deepEqual(
    parseTrustedProxies('127.0.0.1/32, ::1/128, 10.20.0.0/24,2001:db8::/48'),
    ['127.0.0.1/32', '::1/128', '10.20.0.0/24', '2001:db8::/48'],
  );
  for (const invalid of [
    'true',
    'false',
    '*',
    '1',
    'loopback',
    'localhost',
    '10.0.0.1,',
    ',10.0.0.1',
    '10.0.0.1/33',
    '::1/129',
    '0.0.0.0/0',
    '::/0',
    '10.0.0.1/-1',
    '10.0.0.1/1/2',
    'fe80::1%eth0',
  ]) {
    assert.throws(
      () => validateEnvironment({ ...process.env, TRUSTED_PROXIES: invalid }),
      /TRUSTED_PROXIES/,
    );
  }
  for (const invalid of ['', 'a{slot}', 'name*', 'has spaces']) {
    assert.throws(
      () =>
        validateEnvironment({
          ...process.env,
          RATE_LIMIT_REDIS_PREFIX: invalid,
        }),
      /RATE_LIMIT_REDIS_PREFIX/,
    );
  }
  for (const invalid of [0, 99, 5001, 'abc']) {
    assert.throws(
      () =>
        validateEnvironment({
          ...process.env,
          RATE_LIMIT_REDIS_TIMEOUT_MS: invalid,
        }),
      /RATE_LIMIT_REDIS_TIMEOUT_MS/,
    );
  }
  const defaults = { ...process.env };
  delete defaults.TRUSTED_PROXIES;
  delete defaults.RATE_LIMIT_REDIS_PREFIX;
  delete defaults.RATE_LIMIT_REDIS_TIMEOUT_MS;
  const config = validateEnvironment(defaults);
  assert.equal(config.TRUSTED_PROXIES, '');
  assert.equal(config.RATE_LIMIT_REDIS_TIMEOUT_MS, 1000);
});

test(
  'shared Redis rate limits with real HTTP requests',
  { timeout: 30000 },
  async (t) => {
    const host = process.env.REDIS_HOST;
    const port = Number(process.env.REDIS_PORT);
    assert(
      ['localhost', '127.0.0.1', '::1'].includes(host),
      'Local Redis only',
    );
    const prefix = `test:rate-limit:${randomUUID()}`;
    const apps = new Set();
    const redis = new Redis({
      host,
      port,
      lazyConnect: true,
      connectTimeout: 1000,
      commandTimeout: 1000,
      retryStrategy: null,
    });
    redis.on('error', () => {});
    t.after(async () => {
      await Promise.all([...apps].map((app) => app.close()));
      try {
        let cursor = '0';
        do {
          const [next, keys] = await redis.scan(
            cursor,
            'MATCH',
            `${prefix}:*`,
            'COUNT',
            100,
          );
          cursor = next;
          if (keys.length) await redis.del(...keys);
        } while (cursor !== '0');
      } finally {
        redis.disconnect();
      }
    });
    await redis.connect();

    async function createApp(
      suffix,
      {
        trust = '127.0.0.1/32,::1/128',
        redisPort = port,
        ready = true,
        timeout = 1000,
      } = {},
    ) {
      const environment = {
        redisHost: host,
        redisPort,
        rateLimitRedisPrefix: `${prefix}:${suffix}`,
        rateLimitRedisTimeoutMs: timeout,
      };
      const module = await Test.createTestingModule({
        imports: [RateLimitModule],
        controllers: [ProbeController],
      })
        .overrideProvider(EnvironmentService)
        .useValue(environment)
        .compile();
      const app = module.createNestApplication({ logger: false });
      apps.add(app);
      configureTrustedProxies(app, parseTrustedProxies(trust));
      app.useGlobalFilters(new AllExceptionFilter());
      await app.listen(0, '127.0.0.1');
      const storage = app.get(RedisThrottlerStorage);
      if (ready) {
        await until(async () => {
          try {
            await storage.increment('connection-probe', 100, 100, 0, 'setup');
            return true;
          } catch {
            return false;
          }
        });
      }
      return { app, storage, http: request(app.getHttpServer()) };
    }
    const hit = (instance, ip, path = 'burst') =>
      instance.http.get(`/probe/${path}`).set('X-Forwarded-For', ip);

    await t.test(
      'atomic shared budget across two instances, route/client isolation and API restart',
      async () => {
        const a = await createApp('shared');
        const b = await createApp('shared');
        const replies = await Promise.all(
          Array.from({ length: 30 }, (_, i) =>
            hit(i % 2 ? a : b, '198.51.100.7'),
          ),
        );
        assert.equal(replies.filter((r) => r.status === 200).length, 5);
        assert.equal(replies.filter((r) => r.status === 429).length, 25);
        assert.equal(
          a.app.get(ProbeController).calls + b.app.get(ProbeController).calls,
          5,
        );
        assert.deepEqual(
          replies
            .filter((r) => r.status === 200)
            .map((r) => Number(r.headers['x-ratelimit-remaining']))
            .sort(),
          [0, 1, 2, 3, 4],
        );
        for (const reply of replies) {
          if (reply.status === 429) {
            assert.equal(reply.body.status_code, 429);
            assert.equal(reply.body.result, 'error');
            assert(
              Number(reply.headers['retry-after']) > 0 &&
                Number(reply.headers['retry-after']) <= 60,
            );
          } else {
            assert.equal(reply.headers['x-ratelimit-limit'], '5');
            assert(Number(reply.headers['x-ratelimit-reset']) > 0);
          }
        }
        await hit(b, '198.51.100.8').expect(200);
        await hit(b, '198.51.100.7', 'other').expect(200);
        const standard = await hit(b, '198.51.100.7', 'standard').expect(200);
        assert.equal(standard.headers['x-ratelimit-limit'], '60');
        await a.app.close();
        apps.delete(a.app);
        const replacement = await createApp('shared');
        await hit(replacement, '198.51.100.7').expect(429);
        const isolated = await createApp('different-environment');
        await hit(isolated, '198.51.100.7').expect(200);
      },
    );

    await t.test(
      'direct/untrusted peers cannot change identity with forwarded headers',
      async () => {
        for (const [suffix, trust] of [
          ['no-proxies', ''],
          ['untrusted-peer', '10.0.0.1/32'],
        ]) {
          const instance = await createApp(suffix, { trust });
          for (let i = 0; i < 6; i++) {
            const response = await instance.http
              .get('/probe/burst')
              .set('X-Forwarded-For', `198.51.100.${i}`)
              .set('X-Real-IP', `198.51.100.${i}`)
              .set('Forwarded', `for=198.51.100.${i}`)
              .expect(i < 5 ? 200 : 429);
            if (i < 5) assert.equal(response.body.ip, '127.0.0.1');
          }
        }
      },
    );

    await t.test(
      'trusted proxy chains stop at the first untrusted hop, ignoring forged prefixes',
      async () => {
        const instance = await createApp('proxy-chain', {
          trust: '127.0.0.1/32,10.20.0.0/24',
        });
        for (let i = 0; i < 6; i++) {
          const response = await hit(
            instance,
            `192.0.2.${i}, 198.51.100.10, 10.20.0.12`,
          )
            .set('X-Real-IP', `192.0.2.${i}`)
            .set('Forwarded', `for=192.0.2.${i}`)
            .expect(i < 5 ? 200 : 429);
          if (i < 5) assert.equal(response.body.ip, '198.51.100.10');
        }
        await hit(instance, '198.51.100.11, 10.20.0.12').expect(200);
        // The nontrusted intermediate proxy becomes the client bucket.
        const response = await hit(instance, '192.0.2.5, 10.30.0.12').expect(
          200,
        );
        assert.equal(response.body.ip, '10.30.0.12');
        const direct = await instance.http
          .get('/probe/other')
          .set('X-Real-IP', '192.0.2.1')
          .set('Forwarded', 'for=192.0.2.1')
          .expect(200);
        assert.equal(direct.body.ip, '127.0.0.1');
      },
    );

    await t.test(
      'IPv4-mapped and IPv6 privacy addresses cannot create fresh buckets',
      async () => {
        const instance = await createApp('ipv6');
        for (let i = 0; i < 6; i++) {
          await hit(
            instance,
            i % 2 ? '::ffff:198.51.100.20' : '198.51.100.20',
          ).expect(i < 5 ? 200 : 429);
        }
        for (let i = 0; i < 6; i++) {
          await hit(instance, `2001:db8:abcd:1234::${i + 1}`).expect(
            i < 5 ? 200 : 429,
          );
        }
        await hit(instance, '2001:db8:abcd:1235::1').expect(200);
        const ipv6Proxy = await createApp('ipv6-proxy', {
          trust: '127.0.0.1/32,2001:db8:ffff::/48',
        });
        const response = await hit(
          ipv6Proxy,
          '198.51.100.30, 2001:db8:ffff::2',
        ).expect(200);
        assert.equal(response.body.ip, '198.51.100.30');
      },
    );

    await t.test(
      'sliding hits expire individually; block duration is independent of window and is not extended',
      async () => {
        const { storage } = await createApp('expiry');
        const increment = (key, ttl, limit, block = 0, name = 'default') =>
          storage.increment(key, ttl, limit, block, name);
        assert.equal((await increment('slide', 500, 2)).totalHits, 1);
        await delay(300);
        assert.equal((await increment('slide', 500, 2)).totalHits, 2);
        assert.equal((await increment('slide', 500, 2)).isBlocked, true);
        await delay(250);
        const window = await increment('slide', 500, 2);
        assert.equal(window.totalHits, 2); // first hit expired, second still counts
        assert.equal(window.isBlocked, false);
        assert.equal((await increment('slide', 500, 2)).isBlocked, true);
        assert.equal((await increment('block', 100, 1, 500)).isBlocked, false);
        const blocked = await increment('block', 100, 1, 500);
        assert.equal(blocked.isBlocked, true);
        assert.equal(blocked.timeToBlockExpire, 1); // milliseconds in, rounded seconds out
        await delay(180);
        assert.equal((await increment('block', 100, 1, 500)).isBlocked, true);
        await delay(180);
        assert.equal((await increment('block', 100, 1, 500)).isBlocked, true);
        await delay(180);
        const reset = await increment('block', 100, 1, 500);
        assert.equal(reset.isBlocked, false);
        assert.equal(reset.totalHits, 1);
        // Different named throttlers must not share counters even for an identical key.
        assert.equal(
          (await increment('named', 1000, 1, 1000, 'one')).isBlocked,
          false,
        );
        assert.equal(
          (await increment('named', 1000, 1, 1000, 'one')).isBlocked,
          true,
        );
        assert.equal(
          (await increment('named', 1000, 1, 1000, 'two')).isBlocked,
          false,
        );
        await delay(1100);
        const keys = await redis.keys(`${prefix}:expiry:*`);
        assert.equal(keys.length, 0, 'idle hit/block keys must expire');
      },
    );

    await t.test(
      'Redis outage returns 503 without calling the handler; reconnection recovers',
      async () => {
        // A local TCP relay allows killing only this test's Redis connection, not Redis itself.
        const sockets = new Set();
        let online = true;
        const { connect } = require('node:net');
        const relay = createServer((socket) => {
          if (!online) {
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
        });
        await new Promise((resolve) => relay.listen(0, '127.0.0.1', resolve));
        t.after(async () => {
          for (const socket of sockets) socket.destroy();
          await new Promise((resolve) => relay.close(resolve));
        });
        const instance = await createApp('outage', {
          redisPort: relay.address().port,
          timeout: 150,
        });
        await hit(instance, '198.51.100.40').expect(200);
        online = false;
        for (const socket of sockets) socket.destroy();
        await delay(30);
        const started = Date.now();
        const down = await hit(instance, '198.51.100.40').expect(503);
        assert(Date.now() - started < 1500);
        assert.equal(down.body.status_code, 503);
        assert.equal(instance.app.get(ProbeController).calls, 1);
        online = true;
        await until(async () => {
          const response = await hit(instance, '198.51.100.40');
          assert([200, 503].includes(response.status));
          if (response.status === 200) {
            assert.equal(response.headers['x-ratelimit-remaining'], '3');
            return true;
          }
          return false;
        });
        assert.equal(instance.app.get(ProbeController).calls, 2);
        // Pause forwarding on a ready connection to exercise commandTimeout, not just reconnect.
        for (const socket of sockets) socket.pause();
        const timeoutStarted = Date.now();
        await hit(instance, '198.51.100.40').expect(503);
        assert(Date.now() - timeoutStarted < 1500);
        assert.equal(instance.app.get(ProbeController).calls, 2);
        // The stalled socket is dropped and a fresh connection resumes counting.
        await until(async () => {
          const response = await hit(instance, '198.51.100.40');
          assert([200, 503].includes(response.status));
          if (response.status === 200) {
            assert.equal(response.headers['x-ratelimit-remaining'], '2');
            return true;
          }
          return false;
        });
        await instance.app.close();
        apps.delete(instance.app);
      },
    );
  },
);
