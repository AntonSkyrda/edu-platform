const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

require('reflect-metadata');
createRequire(resolve('../../packages/database/package.json'))('dotenv').config(
  { path: '../../.env', quiet: true },
);
const { Logger } = require('@nestjs/common');
const { Queue } = require('bullmq');

const {
  InvitationDeliveryService,
} = require('../dist/auth/services/invitation-delivery.service');
const {
  PasswordResetDeliveryService,
} = require('../dist/auth/services/password-reset-delivery.service');
const {
  validateEnvironment,
} = require('../dist/config/environment.validation');
const { QueueService } = require('../dist/infrastructure/queue/queue.service');
const { redisRelay } = require('./helpers/redis-relay.cjs');
Logger.overrideLogger(false);

async function until(check) {
  const deadline = Date.now() + 2000;
  while (!(await check())) {
    assert(Date.now() < deadline, 'Queue connection did not settle');
    await delay(10);
  }
}

test('queue deadline defaults to 1s and cannot be disabled or unbounded', () => {
  const config = { ...process.env };
  delete config.REDIS_QUEUE_TIMEOUT_MS;
  assert.equal(validateEnvironment(config).REDIS_QUEUE_TIMEOUT_MS, 1000);
  for (const value of ['100', '5000'])
    assert.equal(
      validateEnvironment({ ...config, REDIS_QUEUE_TIMEOUT_MS: value })
        .REDIS_QUEUE_TIMEOUT_MS,
      Number(value),
    );
  for (const value of ['', null, 0, -1, 99, 5001, 1.5, 'invalid'])
    assert.throws(
      () => validateEnvironment({ ...config, REDIS_QUEUE_TIMEOUT_MS: value }),
      /REDIS_QUEUE_TIMEOUT_MS/,
    );
});

test(
  'real Redis queue deadlines cancel stuck connections and allow later recovery',
  { timeout: 20000 },
  async (t) => {
    const relay = await redisRelay(t, 'stall');
    const prefix = `queue_test_${randomUUID().replaceAll('-', '')}`;
    const service = new QueueService(
      { prefix, connection: { host: '127.0.0.1', port: relay.port } },
      { redisQueueTimeoutMs: 200 },
    );
    const inspect = new Queue('email', {
      prefix,
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        commandTimeout: 1000,
        maxRetriesPerRequest: 0,
      },
    });
    const media = new Queue('media', {
      prefix,
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        commandTimeout: 1000,
        maxRetriesPerRequest: 0,
      },
    });
    t.after(async () => {
      await service.onModuleDestroy();
      for (const queue of [inspect, media]) {
        await queue.obliterate({ force: true });
        await queue.close();
      }
    });
    const enqueue = (id) =>
      service.enqueue(
        'email',
        'invitation',
        { invitationId: id },
        { jobId: id },
      );
    const boundedFailure = async (operation) => {
      const started = Date.now();
      await assert.rejects(operation);
      assert(
        Date.now() - started < 1200,
        'Queue exceeded its operation deadline',
      );
      await until(() => relay.sockets.size === 0);
    };

    await t.test(
      'cold TCP blackhole cannot pin BullMQ initialization; same service recovers',
      async () => {
        await boundedFailure(() => enqueue('cold'));
        assert(relay.blocked > 0);
        relay.mode = 'ready';
        await enqueue('cold');
        const job = await inspect.getJob('cold');
        assert.equal(job.name, 'invitation');
        assert.equal(job.opts.attempts, 5);
        assert.deepEqual(job.opts.backoff, {
          type: 'exponential',
          delay: 1000,
        });
      },
    );

    await t.test(
      'established socket stalls are bounded even for concurrent commands; no offline replay',
      async () => {
        relay.mode = 'stall';
        const start = Date.now();
        const results = await Promise.allSettled(
          Array.from({ length: 20 }, (_, i) => enqueue(`stalled-${i}`)),
        );
        assert(results.every((result) => result.status === 'rejected'));
        assert(Date.now() - start < 1200);
        await until(() => relay.sockets.size === 0);
        relay.mode = 'ready';
        await enqueue('after-stall');
        for (let i = 0; i < 20; i++)
          assert.equal(await inspect.getJob(`stalled-${i}`), undefined);
      },
    );

    await t.test(
      'lost Redis acknowledgement is safely retried using the same job ID',
      async () => {
        relay.mode = 'reply-stall';
        await boundedFailure(() => enqueue('lost-reply'));
        assert(
          await inspect.getJob('lost-reply'),
          'Redis committed the job despite the missing reply',
        );
        relay.mode = 'ready';
        await enqueue('lost-reply');
        const jobs = await inspect.getJobs(['wait']);
        assert.equal(jobs.filter((job) => job.id === 'lost-reply').length, 1);
      },
    );

    await t.test(
      'closed connections reject promptly and recover without restarting the service',
      async () => {
        relay.mode = 'refuse';
        relay.disconnect();
        await boundedFailure(() => enqueue('offline'));
        relay.mode = 'ready';
        await enqueue('offline');
        assert(await inspect.getJob('offline'));
      },
    );

    await t.test(
      'scheduler initialization has the same deadline and can be retried',
      async () => {
        // Drop the idle email connection so the socket assertion concerns only media.
        relay.disconnect();
        relay.mode = 'stall';
        await boundedFailure(() => service.schedule('media', 'cleanup', 60000));
        relay.mode = 'ready';
        await service.schedule('media', 'cleanup', 60000);
        assert.equal((await media.getJobScheduler('cleanup')).every, 60000);
      },
    );

    await t.test(
      'dispatchers coalesce overlapping scans and stop at the first queue failure',
      async () => {
        // A backlog of 100 must take one deadline, not 100 deadlines to yield/retry.
        const rows = Array.from({ length: 100 }, () => ({ id: randomUUID() }));
        for (const Delivery of [
          InvitationDeliveryService,
          PasswordResetDeliveryService,
        ]) {
          let reads = 0, enqueues = 0, notifications = 0;
          const pending = new Map(['invitation', 'password-reset', 'password-changed'].map((kind) => [kind, [...rows]]));
          let lastClaim;
          const dispatcher = new Delivery(
            {
              claimDelivery: async (_lease, kind = 'invitation') => {
                reads++;
                if (kind === 'password-changed') notifications++;
                const row = pending.get(kind).shift();
                lastClaim = { row, kind };
                return row ? { ...row, leaseId: randomUUID() } : null;
              },
              finishDispatch: async (_claim, sent) => {
                if (!sent) pending.get(lastClaim.kind).unshift(lastClaim.row);
              },
            },
            { enqueue: (...args) => { enqueues++; return service.enqueue(...args); } },
            { mailDispatchLeaseMs: 60000, invitationDeliveryPollMs: 30000, passwordResetDeliveryPollMs: 30000 },
          );
          relay.mode = 'stall';
          const start = Date.now();
          await Promise.all(
            Array.from({ length: 10 }, () => dispatcher.recover()),
          );
          assert(Date.now() - start < 1200);
          assert.equal(reads, 1);
          assert.equal(enqueues, 1);
          assert.equal(notifications, 0);
          relay.mode = 'ready';
          await dispatcher.recover();
          assert.equal(reads, Delivery === InvitationDeliveryService ? 101 : 201);
          assert.equal(
            enqueues,
            Delivery === InvitationDeliveryService ? 101 : 201,
          );
          await dispatcher.onModuleDestroy();
          await dispatcher.recover();
          assert.equal(reads, Delivery === InvitationDeliveryService ? 101 : 201);
        }
      },
    );

    await t.test(
      'shutdown disconnects an in-flight producer instead of waiting for Redis',
      async () => {
        relay.mode = 'stall';
        const result = assert.rejects(enqueue('shutdown'));
        await until(() => relay.sockets.size > 0);
        const started = Date.now();
        await service.onModuleDestroy();
        await result;
        await until(() => relay.sockets.size === 0);
        assert(Date.now() - started < 1200);
        await assert.rejects(() => enqueue('stopped'), /stopped/);
      },
    );
  },
);
