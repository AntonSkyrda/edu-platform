const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
require('reflect-metadata');
const {
  users,
  userInvitations,
  passwordResets,
} = require('@project/database/schema');

const {
  claimDelivery,
  finishDispatch,
} = require('../dist/auth/repositories/delivery-dispatch');
const {
  InvitationsRepository,
} = require('../dist/auth/repositories/invitations.repository');
const {
  DeliveryMonitorService,
} = require('../dist/auth/services/delivery-monitor.service');
const {
  InvitationDeliveryService,
} = require('../dist/auth/services/invitation-delivery.service');
const {
  InvitationsService,
} = require('../dist/auth/services/invitations.service');
const { databaseFixture, until } = require('./helpers/database-fixture.cjs');

test(
  'durable mail dispatch is fair across instances and recovers expired reservations',
  { timeout: 20000 },
  async (t) => {
    const { db, pool, environment } = await databaseFixture(t, 'dispatch');
    const [user] = await db
      .insert(users)
      .values({
        email: 'dispatch@example.test',
        firstName: 'Test',
        lastName: 'Mail',
        role: 'STUDENT',
        status: 'INVITED',
      })
      .returning();
    const rows = Array.from({ length: 250 }, () => ({
      id: randomUUID(),
      userId: user.id,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
    }));
    await db.insert(userInvitations).values(rows);
    const env = environment();
    const invitations = new InvitationsService(
      new InvitationsRepository({ db }),
      env,
    );
    const queued = [];
    const queue = {
      enqueue: async (_queue, _name, data) => {
        queued.push(data.invitationId);
      },
    };
    const dispatchers = Array.from(
      { length: 2 },
      () => new InvitationDeliveryService(invitations, queue, env),
    );
    await t.test(
      'two API instances enqueue different rows; a waiting first hundred cannot starve later mail',
      async () => {
        await Promise.all(dispatchers.map((service) => service.recover()));
        assert.equal(queued.length, 200);
        assert.equal(new Set(queued).size, 200);
        await Promise.all(dispatchers.map((service) => service.recover()));
        assert.equal(queued.length, 250);
        assert.equal(new Set(queued).size, 250);
        const counts = (
          await pool.query(
            'SELECT min(dispatch_attempts) AS min, max(dispatch_attempts) AS max, count(last_enqueued_at)::int AS enqueued FROM user_invitations',
          )
        ).rows[0];
        assert.deepEqual(counts, { min: 1, max: 1, enqueued: 250 });
      },
    );
    await t.test(
      'a crashed owner loses its lease; a late acknowledgement cannot clear the new owner reservation',
      async () => {
        const id = rows[0].id;
        await pool.query(
          'UPDATE user_invitations SET next_dispatch_at = now() WHERE id = $1',
          [id],
        );
        const first = await claimDelivery(db, 'invitation', 1000);
        assert.equal(first.id, id);
        assert.equal(await claimDelivery(db, 'invitation', 1000), null);
        await pool.query(
          "UPDATE user_invitations SET next_dispatch_at = now() - interval '1 second' WHERE id = $1",
          [id],
        );
        const second = await claimDelivery(db, 'invitation', 60000);
        assert.notEqual(second.leaseId, first.leaseId);
        await finishDispatch(db, 'invitation', first, false, 1);
        assert.equal(
          (
            await pool.query(
              'SELECT dispatch_lease_id FROM user_invitations WHERE id = $1',
              [id],
            )
          ).rows[0].dispatch_lease_id,
          second.leaseId,
        );
        await finishDispatch(db, 'invitation', second, false, 50);
        assert.equal(await claimDelivery(db, 'invitation', 1000), null);
        assert.equal(
          (await until(() => claimDelivery(db, 'invitation', 60000))).id,
          id,
        );
      },
    );
    await t.test(
      'password reset and security notification have independent durable reservations',
      async () => {
        const [reset] = await db
          .insert(passwordResets)
          .values({
            userId: user.id,
            tokenHash: randomUUID(),
            expiresAt: new Date(Date.now() + 60000),
            notificationStatus: 'pending',
            usedAt: new Date(),
          })
          .returning();
        const a = await claimDelivery(db, 'password-reset', 60000);
        const b = await claimDelivery(db, 'password-changed', 60000);
        assert.equal(a.id, reset.id);
        assert.equal(b.id, reset.id);
        assert.notEqual(a.leaseId, b.leaseId);
        assert.equal(await claimDelivery(db, 'password-reset', 60000), null);
        assert.equal(await claimDelivery(db, 'password-changed', 60000), null);
        await finishDispatch(db, 'password-reset', a, true, 1000);
        await finishDispatch(db, 'password-changed', b, true, 1000);
      },
    );
    await t.test(
      'monitor detects backlog, records worker progress and clears resolved invitation failures',
      async () => {
        const monitor = new DeliveryMonitorService({ db }, env, {
          register() {},
        });
        let status = await monitor.status();
        assert.equal(status.status, 'warning');
        assert.equal(status.workers.online, 0);
        monitor.onApplicationBootstrap();
        try {
          await until(
            async () => (await monitor.status()).workers.online === 1,
          );
          await monitor.poll;
          await monitor.track(async () => undefined);
          await monitor.tick();
          assert.match(
            (await monitor.status()).workers.lastCompletedAt,
            /^\d{4}-\d{2}-\d{2}T/,
          );
          await assert.rejects(
            monitor.track(async () => {
              throw new Error('Test delivery failure');
            }),
          );
          await monitor.tick();
          assert.match(
            (await monitor.status()).workers.lastFailedAt,
            /^\d{4}-\d{2}-\d{2}T/,
          );
          await pool.query(
            "UPDATE user_invitations SET delivery_status = 'failed', revoked_at = now()",
          );
          await pool.query(
            "UPDATE password_resets SET delivery_status = 'sent', notification_status = 'sent'",
          );
          assert.equal((await monitor.status()).status, 'ok');
          await pool.query(
            'UPDATE user_invitations SET revoked_at = NULL WHERE id = $1',
            [rows[0].id],
          );
          status = await monitor.status();
          assert.equal(status.status, 'warning');
          assert.equal(
            status.metrics.find((row) => row.kind === 'invitation').failed,
            1,
          );
          await pool.query(
            "UPDATE user_invitations SET delivery_status = 'pending', created_at = now() - interval '10 minutes' WHERE id = $1",
            [rows[0].id],
          );
          status = await monitor.status();
          assert(status.metrics[0].oldestPendingSeconds >= 600);
          assert.equal(status.status, 'warning');
        } finally {
          await monitor.stopWorker();
        }
        assert.equal((await monitor.status()).workers.online, 0);
      },
    );
  },
);
