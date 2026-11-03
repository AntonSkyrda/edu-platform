// Runs the built, unmodified API entry point. Never override guards or providers.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const { createDatabase, createDatabaseUrl } = require('@project/database');
const {
  users,
  userPermissions,
  userInvitations,
} = require('@project/database/schema');
const { hash } = require('argon2');
const Redis = require('ioredis');

const root = resolve(__dirname, '../../..');
const databaseRequire = createRequire(
  join(root, 'packages/database/package.json'),
);
databaseRequire('dotenv').config({ path: join(root, '.env'), quiet: true });
const env = process.env;
for (const host of ['POSTGRES_HOST', 'REDIS_HOST']) {
  assert(
    ['localhost', '127.0.0.1'].includes(env[host]),
    `${host} must be loopback; use local test services`,
  );
}
const namespace = `admin_e2e_${randomUUID().replaceAll('-', '')}`;
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
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  connectTimeout: 2000,
  commandTimeout: 2000,
  retryStrategy: () => null,
});
redis.on('error', () => undefined);
// Refuse SMTP locally: the suite cannot send mail using a developer's credentials.
const smtp = createServer((socket) =>
  socket.end('421 E2E mail delivery disabled\r\n'),
);
let child;
let directory;
let createdSchema = false;
let stopping = false;

async function start() {
  await redis.connect();
  await pool.query(`CREATE SCHEMA "${namespace}"`);
  createdSchema = true;
  const migrations = join(root, 'packages/database/migrations');
  const journal = JSON.parse(
    await readFile(join(migrations, 'meta/_journal.json'), 'utf8'),
  );
  for (const entry of journal.entries) {
    await pool.query(
      (await readFile(join(migrations, `${entry.tag}.sql`), 'utf8')).replaceAll(
        '"public".',
        `"${namespace}".`,
      ),
    );
  }
  const passwordHash = await hash('E2e-only-password-123!');
  for (const [name, role] of [
    ['admin', 'ADMIN'],
    ['login', 'ADMIN'],
    ['reader', 'MANAGER'],
  ]) {
    const [user] = await db
      .insert(users)
      .values({
        email: `${name}@admin-e2e.test`,
        firstName: name,
        lastName: 'E2E',
        role,
        status: 'ACTIVE',
        passwordHash,
      })
      .returning();
    if (role === 'MANAGER')
      await db
        .insert(userPermissions)
        .values({ userId: user.id, permission: 'subjects.read' });
  }
  for (const status of ['failed', 'sent']) {
    const [user] = await db
      .insert(users)
      .values({
        email: `mail-${status}@admin-e2e.test`,
        firstName: 'Mail',
        lastName: status,
        role: 'STUDENT',
        status: 'INVITED',
      })
      .returning();
    await db
      .insert(userInvitations)
      .values({
        userId: user.id,
        tokenHash: randomUUID(),
        deliveryStatus: status,
        deliveryAttempts: status === 'failed' ? 5 : 1,
        deliveryError: status === 'failed' ? 'EAUTH' : null,
        deliveredAt: status === 'sent' ? new Date() : null,
        expiresAt: new Date(Date.now() + 86400000),
      });
  }
  directory = await mkdtemp(join(tmpdir(), 'edu-admin-e2e-'));
  smtp.listen(0, '127.0.0.1');
  await once(smtp, 'listening');
  child = spawn(process.execPath, [join(root, 'apps/api/dist/main.js')], {
    cwd: join(root, 'apps/api'),
    stdio: 'inherit',
    env: {
      ...env,
      NODE_ENV: 'test',
      APP_PORT: '3101',
      FRONTEND_ORIGIN: 'http://127.0.0.1:4174',
      // Test contexts simulate separate clients through this local proxy only.
      TRUSTED_PROXIES: '127.0.0.1/32,::1/128',
      POSTGRES_SCHEMA: namespace,
      REDIS_QUEUE_PREFIX: namespace,
      RATE_LIMIT_REDIS_PREFIX: `${namespace}:rate-limit`,
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_ROOT: join(directory, 'storage'),
      ACCESS_JWT_SECRET: `${namespace}-access`,
      INVITATION_TOKEN_SECRET: `${namespace}-invite`,
      PASSWORD_RESET_TOKEN_SECRET: `${namespace}-reset`,
      ACCESS_TOKEN_TTL_SECONDS: '900',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.address().port),
      SMTP_SECURE: 'false',
      SMTP_USER: 'e2e',
      SMTP_PASSWORD: 'e2e',
      SMTP_FROM: 'e2e@admin-e2e.test',
      LOG_LEVEL: 'warn',
    },
  });
  child.once('error', (error) => {
    console.error(error);
    void stop(1);
  });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`E2E API exited unexpectedly (${code ?? signal})`);
      void stop(1);
    }
  });
}

async function cleanup() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 7000);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }
  await Promise.all([
    (async () => {
      if (createdSchema) await pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
    })().finally(() => pool.end()),
    (async () => {
      if (redis.status !== 'ready') await redis.connect();
      // Scan finishes before deleting, so cursor movement cannot skip keys.
      const keys = [];
      let cursor = '0';
      do {
        const result = await redis.scan(
          cursor,
          'MATCH',
          `${namespace}:*`,
          'COUNT',
          1000,
        );
        [cursor] = result;
        keys.push(...result[1]);
      } while (cursor !== '0');
      for (let i = 0; i < keys.length; i += 500)
        await redis.del(...keys.slice(i, i + 500));
    })().finally(() => redis.disconnect()),
    directory
      ? rm(directory, { recursive: true, force: true })
      : Promise.resolve(),
    smtp.listening
      ? new Promise((res, rej) =>
          smtp.close((error) => (error ? rej(error) : res())),
        )
      : Promise.resolve(),
  ]);
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await startup.catch(() => undefined);
  try {
    await cleanup();
  } catch (error) {
    console.error('E2E cleanup failed:', error);
    code = 1;
  }
  process.exitCode = code;
}
const startup = start();
startup.catch((error) => {
  console.error(error);
  void stop(1);
});
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
