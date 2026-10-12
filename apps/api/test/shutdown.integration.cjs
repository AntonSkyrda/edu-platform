const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, rm } = require('node:fs/promises');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');
require('reflect-metadata');
const { users } = require('@project/database/schema');
const { hash } = require('argon2');
const Redis = require('ioredis');

const { databaseFixture, until } = require('./helpers/database-fixture.cjs');
const { redisRelay } = require('./helpers/redis-relay.cjs');
const { smtpServer } = require('./helpers/smtp-server.cjs');

async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test(
  'production SIGTERM drains real deliveries before closing PostgreSQL and bounds a stalled shutdown',
  { timeout: 120000 },
  async (t) => {
    const { db, pool, namespace } = await databaseFixture(t, 'shutdown');
    const smtp = await smtpServer(t, 'data-hold');
    const relay = await redisRelay(t);
    const directory = await mkdtemp(join(tmpdir(), 'edu-shutdown-'));
    const password = 'Shutdown-test-only-password!';
    await db
      .insert(users)
      .values({
        email: 'admin@shutdown.test',
        firstName: 'Admin',
        lastName: 'Test',
        role: 'ADMIN',
        status: 'ACTIVE',
        passwordHash: await hash(password),
      });
    const redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      commandTimeout: 1000,
      maxRetriesPerRequest: 0,
      retryStrategy: null,
    });
    redis.on('error', () => undefined);
    let child, exited;
    const start = async (shutdownMs) => {
      const port = await unusedPort();
      child = spawn(process.execPath, [resolve('dist/main.js')], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          APP_PORT: String(port),
          NODE_ENV: 'test',
          LOG_LEVEL: 'silent',
          POSTGRES_SCHEMA: namespace,
          REDIS_HOST: '127.0.0.1',
          REDIS_PORT: String(relay.port),
          REDIS_QUEUE_PREFIX: namespace,
          RATE_LIMIT_REDIS_PREFIX: `${namespace}:limits`,
          STORAGE_DRIVER: 'local',
          STORAGE_LOCAL_ROOT: directory,
          FRONTEND_ORIGIN: 'http://localhost:3001',
          TRUSTED_PROXIES: '',
          ACCESS_JWT_SECRET: `${namespace}-access`,
          INVITATION_TOKEN_SECRET: `${namespace}-invite`,
          PASSWORD_RESET_TOKEN_SECRET: `${namespace}-reset`,
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: String(smtp.port),
          SMTP_SECURE: 'false',
          SMTP_USER: 'local',
          SMTP_PASSWORD: 'local',
          SMTP_FROM: 'test@shutdown.test',
          SMTP_SOCKET_TIMEOUT_MS: '5000',
          SHUTDOWN_TIMEOUT_MS: String(shutdownMs),
          MAIL_DISPATCH_LEASE_MS: '1000',
          PASSWORD_RESET_DELIVERY_POLL_SECONDS: '1',
        },
      });
      child.stdout.resume();
      child.stderr.resume();
      exited = once(child, 'exit');
      const url = `http://127.0.0.1:${port}`;
      await until(async () => {
        assert.equal(child.exitCode, null, 'API exited during startup');
        try {
          return (await fetch(`${url}/health/ready`)).status === 200;
        } catch {
          return false;
        }
      }, 10000);
      const login = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3001',
        },
        body: JSON.stringify({ email: 'admin@shutdown.test', password }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      return {
        url,
        invite: async (email) => {
          const response = await fetch(`${url}/auth/invitations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: 'http://localhost:3001',
              Cookie: cookie,
            },
            body: JSON.stringify({
              email,
              firstName: 'Test',
              lastName: 'Shutdown',
              role: 'STUDENT',
            }),
          });
          assert.equal(response.status, 201);
          return (await response.json()).detail;
        },
      };
    };
    try {
      await t.test(
        'the actual signal path rejects new work but lets an active SMTP send record its result',
        async () => {
          const api = await start(5000);
          const user = await api.invite('drain@shutdown.test');
          await until(() => smtp.data > 0);
          child.kill('SIGTERM');
          await until(
            async () => (await fetch(`${api.url}/health/ready`)).status === 503,
          );
          assert.equal((await fetch(`${api.url}/health/live`)).status, 200);
          assert.equal(
            (await fetch(`${api.url}/catalog/subjects`)).status,
            503,
          );
          assert.equal(child.exitCode, null);
          smtp.acceptPending();
          const [code, signal] = await exited;
          assert(
            code === 0 || signal === 'SIGTERM',
            `Unexpected exit ${code}/${signal}`,
          );
          const row = (
            await pool.query(
              'SELECT delivery_status, delivery_attempts FROM user_invitations WHERE user_id = $1',
              [user.id],
            )
          ).rows[0];
          assert.deepEqual(row, {
            delivery_status: 'sent',
            delivery_attempts: 1,
          });
        },
      );
      await t.test(
        'a stuck SMTP/Redis worker cannot exceed the shutdown deadline; pending mail survives restart',
        async () => {
          const api = await start(1000);
          const before = smtp.data;
          const user = await api.invite('restart@shutdown.test');
          await until(() => smtp.data > before);
          relay.mode = 'stall';
          const started = Date.now();
          child.kill('SIGTERM');
          const [code] = await exited;
          assert.equal(code, 1);
          assert(
            Date.now() - started < 4000,
            'Shutdown must have a finite deadline',
          );
          assert.equal(
            (
              await pool.query(
                'SELECT delivery_status FROM user_invitations WHERE user_id = $1',
                [user.id],
              )
            ).rows[0].delivery_status,
            'pending',
          );
          relay.mode = 'ready';
          smtp.mode = 'ready';
          smtp.disconnect();
          await start(5000);
          // BullMQ recovers the abandoned active job after its lock expires.
          await until(
            async () =>
              (
                await pool.query(
                  'SELECT delivery_status FROM user_invitations WHERE user_id = $1',
                  [user.id],
                )
              ).rows[0].delivery_status === 'sent',
            75000,
          );
          child.kill('SIGTERM');
          await exited;
        },
      );
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
      relay.mode = 'ready';
      relay.disconnect();
      try {
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
      } finally {
        redis.disconnect();
        await rm(directory, { recursive: true, force: true });
      }
    }
  },
);
