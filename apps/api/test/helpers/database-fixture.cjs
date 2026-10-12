const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { resolve, join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const { ConfigService } = require('@nestjs/config');
const { createDatabase, createDatabaseUrl } = require('@project/database');

const { EnvironmentService } = require('../../dist/config/environment.service');
const {
  validateEnvironment,
} = require('../../dist/config/environment.validation');
createRequire(resolve('../../packages/database/package.json'))('dotenv').config(
  { path: '../../.env', quiet: true },
);

async function databaseFixture(t, prefix = 'reliability') {
  assert(
    ['localhost', '127.0.0.1'].includes(process.env.POSTGRES_HOST),
    'Local PostgreSQL only',
  );
  const namespace = `${prefix}_${randomUUID().replaceAll('-', '')}`;
  const env = process.env;
  const connectionString = createDatabaseUrl({
    host: env.POSTGRES_HOST,
    port: Number(env.POSTGRES_PORT),
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
    schema: namespace,
  });
  const { db, pool } = createDatabase({ connectionString });
  await pool.query(`CREATE SCHEMA "${namespace}"`);
  t.after(async () => {
    try {
      await pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
    } finally {
      await pool.end();
    }
  });
  const migrations = resolve('../../packages/database/migrations');
  const journal = JSON.parse(
    await readFile(join(migrations, 'meta/_journal.json'), 'utf8'),
  );
  for (const entry of journal.entries)
    await pool.query(
      (await readFile(join(migrations, `${entry.tag}.sql`), 'utf8')).replaceAll(
        '"public".',
        `"${namespace}".`,
      ),
    );
  const environment = (overrides = {}) =>
    new EnvironmentService(
      new ConfigService(
        validateEnvironment({
          ...env,
          NODE_ENV: 'test',
          LOG_LEVEL: 'silent',
          POSTGRES_SCHEMA: namespace,
          REDIS_QUEUE_PREFIX: namespace,
          RATE_LIMIT_REDIS_PREFIX: `${namespace}:limits`,
          ...overrides,
        }),
      ),
    );
  return { db, pool, namespace, connectionString, environment };
}
async function until(check, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (true) {
    const result = await check();
    if (result) return result;
    assert(Date.now() < deadline, 'Timed out waiting for test state');
    await delay(20);
  }
}
module.exports = { databaseFixture, until };
