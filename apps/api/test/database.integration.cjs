const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
require('reflect-metadata');
const { sql } = require('@project/database');

const {
  AllExceptionFilter,
} = require('../dist/common/filters/all-exception.filter');
const { DatabaseService } = require('../dist/database/database.service');
const { databaseFixture } = require('./helpers/database-fixture.cjs');

test(
  'PostgreSQL enforces operation deadlines and keeps the application pool usable',
  { timeout: 15000 },
  async (t) => {
    const fixture = await databaseFixture(t, 'db_deadlines');
    const database = new DatabaseService(
      fixture.environment({
        POSTGRES_STATEMENT_TIMEOUT_MS: 300,
        POSTGRES_LOCK_TIMEOUT_MS: 100,
        POSTGRES_IDLE_TRANSACTION_TIMEOUT_MS: 200,
      }),
    );
    const pool = database.connection.pool;
    try {
      const settings = (
        await pool.query(
          "SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock, current_setting('idle_in_transaction_session_timeout') AS idle",
        )
      ).rows[0];
      assert.deepEqual(settings, {
        statement: '300ms',
        lock: '100ms',
        idle: '200ms',
      });
      await fixture.pool.query(
        'CREATE TABLE deadlines (id int PRIMARY KEY, value int NOT NULL)',
      );
      await fixture.pool.query('INSERT INTO deadlines VALUES (1, 0)');
      await t.test(
        'a blocked write is cancelled on the server, rolls back its transaction and maps to a safe retryable error',
        async () => {
          const blocker = await fixture.pool.connect();
          try {
            await blocker.query('BEGIN');
            await blocker.query('UPDATE deadlines SET value = 10 WHERE id = 1');
            let failure;
            const started = Date.now();
            await assert.rejects(
              database.db.transaction(async (tx) => {
                await tx.execute(sql`INSERT INTO deadlines VALUES (2, 9)`);
                await tx.execute(
                  sql`UPDATE deadlines SET value = 99 WHERE id = 1`,
                );
              }),
              (error) => {
                failure = error;
                return error.cause?.code === '55P03';
              },
            );
            assert(Date.now() - started < 1500);
            assert.equal(
              (
                await fixture.pool.query(
                  'SELECT count(*)::int AS count FROM deadlines WHERE id = 2',
                )
              ).rows[0].count,
              0,
            );
            const response = {
              headers: {},
              setHeader(name, value) {
                this.headers[name] = value;
              },
              status(value) {
                this.statusCode = value;
                return this;
              },
              json(body) {
                this.body = body;
              },
            };
            new AllExceptionFilter().catch(failure, {
              switchToHttp: () => ({ getResponse: () => response }),
            });
            assert.equal(response.statusCode, 503);
            assert.equal(response.body.code, 'DATABASE_TIMEOUT');
            assert.equal(response.headers['Retry-After'], '1');
            assert(!JSON.stringify(response.body).includes('deadlines'));
          } finally {
            await blocker.query('ROLLBACK');
            blocker.release();
          }
          assert.equal(
            (
              await fixture.pool.query(
                'SELECT value FROM deadlines WHERE id = 1',
              )
            ).rows[0].value,
            0,
          );
          await database.db.execute(
            sql`UPDATE deadlines SET value = 1 WHERE id = 1`,
          );
        },
      );
      await t.test(
        'long SQL is actually cancelled and the next query succeeds',
        async () => {
          await assert.rejects(
            database.db.execute(sql`SELECT pg_sleep(10)`),
            (error) => error.cause?.code === '57014',
          );
          assert.equal(
            (await pool.query('SELECT 42 AS answer')).rows[0].answer,
            42,
          );
          const active = await fixture.pool.query(
            "SELECT count(*)::int AS count FROM pg_stat_activity WHERE query = 'SELECT pg_sleep(10)' AND state = 'active'",
          );
          assert.equal(active.rows[0].count, 0);
        },
      );
      await t.test(
        'an abandoned transaction is terminated by PostgreSQL and its changes are rolled back',
        async () => {
          const client = await pool.connect();
          try {
            const failure = once(client, 'error');
            await client.query('BEGIN');
            await client.query('UPDATE deadlines SET value = 77 WHERE id = 1');
            const [error] = await failure;
            assert.equal(error.code, '25P03');
          } finally {
            client.release(true);
          }
          assert.equal(
            (
              await fixture.pool.query(
                'SELECT value FROM deadlines WHERE id = 1',
              )
            ).rows[0].value,
            1,
          );
          await database.checkHealth(500);
        },
      );
    } finally {
      await database.onModuleDestroy();
    }
  },
);
