const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { test } = require('node:test');

const databaseRequire = createRequire(
  resolve('../../packages/database/package.json'),
);
databaseRequire('dotenv').config({ path: '../../.env', quiet: true });
require('reflect-metadata');
const { Module, ValidationPipe } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { Test } = require('@nestjs/testing');
const { createDatabase, createDatabaseUrl, eq } = require('@project/database');
const {
  users,
  userInvitations,
  userSessions,
} = require('@project/database/schema');
const { passwordResets } = require('@project/database/schema');
const { hash, argon2id } = require('argon2');
const request = require('supertest');

const { AuthModule } = require('../dist/auth/auth.module');
const { AuthService } = require('../dist/auth/auth.service');
const {
  AuthEmailProcessor,
} = require('../dist/auth/processors/auth-email.processor');
const {
  InvitationEmailProcessor,
} = require('../dist/auth/processors/invitation-email.processor');
const {
  PasswordResetEmailProcessor,
} = require('../dist/auth/processors/password-reset-email.processor');
const {
  InvitationsRepository,
} = require('../dist/auth/repositories/invitations.repository');
const {
  PasswordResetsRepository,
} = require('../dist/auth/repositories/password-resets.repository');
const {
  SessionsRepository,
} = require('../dist/auth/repositories/sessions.repository');
const {
  AccessTokenService,
} = require('../dist/auth/services/access-token.service');
const {
  InvitationDeliveryService,
} = require('../dist/auth/services/invitation-delivery.service');
const {
  InvitationsService,
} = require('../dist/auth/services/invitations.service');
const {
  PasswordRecoveryService,
} = require('../dist/auth/services/password-recovery.service');
const {
  PasswordResetDeliveryService,
} = require('../dist/auth/services/password-reset-delivery.service');
const {
  PasswordResetsService,
} = require('../dist/auth/services/password-resets.service');
const { SessionsService } = require('../dist/auth/services/sessions.service');
const {
  AllExceptionFilter,
} = require('../dist/common/filters/all-exception.filter');
const { CsrfGuard } = require('../dist/common/guards/csrf.guard');
const {
  ResponseInterceptor,
} = require('../dist/common/interceptors/response.interceptor');
const { PasswordService } = require('../dist/common/security/password.service');
const { EnvironmentService } = require('../dist/config/environment.service');
const { DatabaseService } = require('../dist/database/database.service');
const { EmailModule } = require('../dist/infrastructure/email/email.module');
const { QueueModule } = require('../dist/infrastructure/queue/queue.module');
const { QueueService } = require('../dist/infrastructure/queue/queue.service');
const { createAdmin } = require('../dist/scripts/helpers/create-admin');
const { UsersRepository } = require('../dist/users/users.repository');
const { UsersService } = require('../dist/users/users.service');

const status = (code) => (error) => error.getStatus?.() === code;
const password = 'correct horse battery staple';

test('invitation and session flow against isolated PostgreSQL schema', async (t) => {
  const env = process.env;
  assert(
    ['localhost', '127.0.0.1'].includes(env.POSTGRES_HOST),
    'Only a local test database is allowed',
  );
  const schema = `auth_test_${randomUUID().replaceAll('-', '')}`;
  const connection = createDatabase({
    connectionString: createDatabaseUrl({
      host: env.POSTGRES_HOST,
      port: Number(env.POSTGRES_PORT),
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB,
      schema,
    }),
  });
  const { db, pool } = connection;
  const jobs = [];
  let services;
  const queue = {
    enqueue: async (queueName, jobName, job, options) => {
      assert.equal(queueName, 'email');
      assert.equal(jobName, 'invitation');
      assert.equal(options.jobId, job.invitationId);
      assert.equal(job.token, undefined);
      jobs.push({ ...job, token: services[1].deliveryToken(job.invitationId) });
    },
  };
  const environment = {
    passwordResetTokenSecret: randomBytes(32).toString('hex'),
    passwordResetTtlMs: 1800000,
    passwordResetCooldownMs: 60000,
    passwordResetDeliveryPollMs: 30000,
    passwordResetResponseMinMs: 0,
    accessJwtSecret: randomBytes(32).toString('hex'),
    frontendOrigin: 'http://localhost:3001',
    trustedRequestOrigins: ['http://localhost:3001', 'http://localhost:3000'],
    isProduction: false,
    accessTokenTtlSeconds: 900,
    sessionTtlMs: 2592000000,
    invitationTtlMs: 172800000,
    invitationDeliveryPollMs: 30000,
    invitationTokenSecret: randomBytes(32).toString('hex'),
    jwtIssuer: 'edu-platform',
    jwtAudience: 'edu-platform-api',
  };
  let app;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    for (const file of readdirSync('../../packages/database/migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const sql = readFileSync(
        `../../packages/database/migrations/${file}`,
        'utf8',
      ).replaceAll('"public".', `"${schema}".`);
      await pool.query(sql);
    }
    const repositories = [
      new UsersRepository({ db }),
      new InvitationsRepository({ db }),
      new SessionsRepository({ db }),
      new PasswordResetsRepository({ db }),
    ];
    services = [
      new UsersService(repositories[0]),
      new InvitationsService(repositories[1], environment),
      new SessionsService(repositories[2], environment),
      new PasswordResetsService(repositories[3], environment),
    ];
    const delivery = new InvitationDeliveryService(
      services[1],
      queue,
      environment,
    );
    const service = new AuthService(
      { db },
      new AccessTokenService(new JwtService(), environment),
      new PasswordService(),
      delivery,
      ...services,
    );
    await t.test(
      'admin script creates a login-ready account and rejects duplicates and invalid input',
      async () => {
        const input = {
          email: ' Script.Admin@Example.test ',
          firstName: ' Script ',
          lastName: ' Admin ',
          password,
        };
        const created = await createAdmin(
          services[0],
          input,
          new PasswordService(),
        );
        const stored = await services[0].getByIdOrThrow(created.id);
        assert.equal(stored.role, 'ADMIN');
        assert.equal(stored.status, 'ACTIVE');
        assert.equal(stored.email, 'script.admin@example.test');
        assert.equal(stored.firstName, 'Script');
        assert.notEqual(stored.passwordHash, password);
        assert.equal(created.passwordHash, undefined);
        const tokens = await service.login(stored.email, password);
        assert.equal(
          (await service.authenticate(tokens.accessToken)).user.role,
          'ADMIN',
        );
        await assert.rejects(
          createAdmin(services[0], input, new PasswordService()),
          status(409),
        );
        assert.equal(
          (await services[0].getByIdOrThrow(created.id)).passwordHash,
          stored.passwordHash,
        );
        await assert.rejects(
          createAdmin(
            services[0],
            { ...input, email: 'invalid' },
            new PasswordService(),
          ),
          /valid email/,
        );
        await assert.rejects(
          createAdmin(
            services[0],
            { ...input, password: 'short' },
            new PasswordService(),
          ),
          /8–64/,
        );
        await assert.rejects(
          createAdmin(
            services[0],
            { ...input, firstName: ' ' },
            new PasswordService(),
          ),
          /1–100/,
        );
        await db.delete(users).where(eq(users.id, created.id));
      },
    );
    const passwordHash = await hash(password, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const [admin] = await db
      .insert(users)
      .values({
        email: 'admin@example.test',
        firstName: 'Admin',
        lastName: 'Test',
        role: 'ADMIN',
        status: 'ACTIVE',
        passwordHash,
      })
      .returning();
    const adminTokens = await service.login(admin.email, password);
    const actor = await service.authenticate(adminTokens.accessToken);
    await t.test(
      'inherited CRUD, pagination, immutable fields and missing records',
      async () => {
        const repo = repositories[0];
        const first = await repo.create({
          email: 'crud1@example.test',
          firstName: 'First',
          lastName: 'CrudFixture',
          role: 'STUDENT',
        });
        const second = await repo.create({
          email: 'crud2@example.test',
          firstName: 'Second',
          lastName: 'CrudFixture',
          role: 'STUDENT',
        });
        assert.equal((await repo.findById(first.id)).email, first.email);
        assert.equal(
          (await repo.findByEmail('CRUD1@EXAMPLE.TEST')).id,
          first.id,
        );
        const options = { where: eq(users.lastName, 'CrudFixture'), limit: 1 };
        const [page1] = await repo.findMany(options);
        const [page2] = await repo.findMany({ ...options, offset: 1 });
        assert.notEqual(page1.id, page2.id);
        assert.equal(
          (await repo.findMany({ ...options, offset: 2 })).length,
          0,
        );
        await assert.rejects(repo.findMany({ limit: 0 }), RangeError);
        await assert.rejects(repo.findMany({ offset: -1 }), RangeError);
        const changed = await repo.update(first.id, {
          firstName: 'Changed',
          id: randomUUID(),
          createdAt: new Date(0),
          updatedAt: new Date(0),
        });
        assert.equal(changed.id, first.id);
        assert.equal(changed.createdAt.getTime(), first.createdAt.getTime());
        assert.equal(changed.firstName, 'Changed');
        assert(changed.updatedAt.getTime() >= first.updatedAt.getTime());
        await assert.rejects(repo.update(first.id, {}), TypeError);
        const missing = randomUUID();
        assert.equal(await repo.findById(missing), null);
        assert.equal(
          await repo.update(missing, { firstName: 'Missing' }),
          null,
        );
        assert.equal(await repo.delete(first.id), true);
        assert.equal(await repo.delete(first.id), false);
        assert.equal(await repo.delete(second.id), true);
      },
    );

    await t.test(
      'one transaction rolls back writes through multiple repositories',
      async () => {
        let userId, sessionId;
        const rollback = new Error('rollback test');
        await assert.rejects(
          db.transaction(async (tx) => {
            const user = await repositories[0].create(
              {
                email: 'rollback@example.test',
                firstName: 'Roll',
                lastName: 'Back',
                role: 'STUDENT',
              },
              tx,
            );
            userId = user.id;
            const session = await repositories[2].create(
              {
                userId,
                refreshTokenHash: randomBytes(32).toString('hex'),
                expiresAt: new Date(Date.now() + 60000),
              },
              tx,
            );
            sessionId = session.id;
            assert.equal(
              (await repositories[0].findById(userId, tx)).id,
              userId,
            );
            assert.equal(
              (await repositories[2].findById(sessionId, tx)).id,
              sessionId,
            );
            throw rollback;
          }),
          (error) => error === rollback,
        );
        assert.equal(await repositories[0].findById(userId), null);
        assert.equal(await repositories[2].findById(sessionId), null);
      },
    );

    await t.test(
      'generic user operations and explicit locked reads',
      async () => {
        const userService = services[0];
        const created = await userService.create({
          email: ' Generic@Example.test ',
          firstName: 'Generic',
          lastName: 'User',
          role: 'STUDENT',
          status: 'ACTIVE',
        });
        assert.equal(created.email, 'generic@example.test');
        assert.equal(created.status, 'ACTIVE');
        assert.equal(
          (await userService.getByIdOrThrow(created.id)).id,
          created.id,
        );
        await assert.rejects(
          userService.getByIdOrThrow(randomUUID()),
          status(404),
        );
        await assert.rejects(
          userService.getByIdOrThrow(created.id, { lock: 'update' }),
          TypeError,
        );
        await db.transaction(async (transaction) => {
          assert.equal(
            (
              await userService.getByIdOrThrow(created.id, {
                transaction,
                lock: 'update',
              })
            ).id,
            created.id,
          );
          const updated = await userService.update(
            created.id,
            { email: ' Changed@Example.test ' },
            transaction,
          );
          assert.equal(updated.email, 'changed@example.test');
        });
        await assert.rejects(
          userService.update(created.id, { email: admin.email }),
          status(409),
        );
        assert.equal(
          (await userService.getByIdOrThrow(created.id)).email,
          'changed@example.test',
        );
        await repositories[0].delete(created.id);
      },
    );

    await t.test(
      'invitation and session lifetimes come from configuration',
      async () => {
        const settings = {
          ...environment,
          invitationTtlMs: 10000,
          sessionTtlMs: 20000,
        };
        const invitationService = new InvitationsService(
          repositories[1],
          settings,
        );
        const sessionService = new SessionsService(repositories[2], settings);
        const rollback = new Error('configuration test rollback');
        await assert.rejects(
          db.transaction(async (tx) => {
            const before = Date.now();
            const issued = await invitationService.issue(admin.id, tx);
            const started = await sessionService.create(admin.id, tx);
            assert(issued.invitation.expiresAt.getTime() >= before + 10000);
            assert(issued.invitation.expiresAt.getTime() <= Date.now() + 10000);
            assert(started.session.expiresAt.getTime() >= before + 20000);
            assert(started.session.expiresAt.getTime() <= Date.now() + 20000);
            throw rollback;
          }),
          (error) => error === rollback,
        );
      },
    );

    let invited, invitationToken, memberTokens;

    await t.test(
      'admin invites, normalizes email, stores only hash and queues mail',
      async () => {
        invited = await service.invite(actor, {
          email: ' Member@Example.test ',
          firstName: 'Member',
          lastName: 'Test',
          role: 'MANAGER',
        });
        assert.equal(invited.email, 'member@example.test');
        assert.equal(invited.status, 'INVITED');
        assert.equal('passwordHash' in invited, false);
        invitationToken = jobs.at(-1).token;
        const [invitation] = await db
          .select()
          .from(userInvitations)
          .where(eq(userInvitations.userId, invited.id));
        assert.equal(
          invitation.tokenHash,
          createHash('sha256').update(invitationToken).digest('hex'),
        );
        assert.notEqual(invitation.tokenHash, invitationToken);
        await assert.rejects(
          service.login(invited.email, password),
          status(401),
        );
        await assert.rejects(
          service.invite(actor, {
            email: invited.email.toUpperCase(),
            firstName: 'X',
            lastName: 'Y',
            role: 'STUDENT',
          }),
          status(409),
        );
      },
    );

    await t.test(
      'email processor sends fragment link without activating user',
      async () => {
        const messages = [];
        const worker = new InvitationEmailProcessor(
          services[1],
          { send: async (message) => messages.push(message) },
          environment,
        );
        await worker.process({ name: 'invitation', data: jobs.at(-1) });
        assert.equal(messages.length, 1);
        const url = new URL(
          messages[0].text.split('\n').find((line) => line.startsWith('http')),
        );
        assert.equal(url.search, '');
        assert.equal(
          new URLSearchParams(url.hash.slice(1)).get('token'),
          invitationToken,
        );
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, invited.id));
        assert.equal(user.status, 'INVITED');
      },
    );

    await t.test(
      'concurrent acceptance succeeds once and password is hashed',
      async () => {
        const results = await Promise.allSettled([
          service.acceptInvitation(invitationToken, password),
          service.acceptInvitation(invitationToken, password),
        ]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal(
          results.filter((r) => r.status === 'rejected')[0].reason.getStatus(),
          401,
        );
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, invited.id));
        assert.equal(user.status, 'ACTIVE');
        assert(user.passwordHash.startsWith('$argon2id$'));
        memberTokens = await service.login(
          invited.email.toUpperCase(),
          password,
        );
        assert.equal(
          (await service.authenticate(memberTokens.accessToken)).user.id,
          user.id,
        );
        await assert.rejects(
          service.login(invited.email, 'wrong-password'),
          status(401),
        );
        await assert.rejects(
          service.login('absent@example.test', password),
          status(401),
        );
      },
    );

    await t.test('managers cannot invite, resend or block', async () => {
      const member = await service.authenticate(memberTokens.accessToken);
      await assert.rejects(
        service.invite(member, {
          email: 'other@example.test',
          firstName: 'X',
          lastName: 'Y',
          role: 'STUDENT',
        }),
        status(403),
      );
      await assert.rejects(service.resend(member, invited.id), status(403));
      await assert.rejects(
        service.setBlocked(member, admin.id, true),
        status(403),
      );
    });

    await t.test(
      'refresh rotation is single use under concurrent requests',
      async () => {
        const results = await Promise.allSettled([
          service.refresh(memberTokens.refreshToken),
          service.refresh(memberTokens.refreshToken),
        ]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        const next = results.find((r) => r.status === 'fulfilled').value;
        assert.notEqual(next.refreshToken, memberTokens.refreshToken);
        await assert.rejects(
          service.refresh(memberTokens.refreshToken),
          status(401),
        );
        memberTokens = next;
        const [session] = await db
          .select()
          .from(userSessions)
          .where(eq(userSessions.userId, invited.id));
        assert.equal(
          session.refreshTokenHash,
          createHash('sha256').update(next.refreshToken).digest('hex'),
        );
      },
    );

    await t.test(
      'block revokes every session immediately and unblock never restores them',
      async () => {
        const second = await service.login(invited.email, password);
        await service.setBlocked(actor, invited.id, true);
        for (const tokens of [memberTokens, second]) {
          await assert.rejects(
            service.authenticate(tokens.accessToken),
            status(401),
          );
          await assert.rejects(
            service.refresh(tokens.refreshToken),
            status(401),
          );
        }
        await assert.rejects(
          service.login(invited.email, password),
          status(401),
        );
        await service.setBlocked(actor, invited.id, false);
        await assert.rejects(
          service.authenticate(memberTokens.accessToken),
          status(401),
        );
        memberTokens = await service.login(invited.email, password);
        await assert.rejects(
          service.setBlocked(actor, admin.id, true),
          status(403),
        );
      },
    );

    await t.test(
      'blocking wins over a concurrent login or refresh',
      async () => {
        const active = await service.login(invited.email, password);
        await Promise.allSettled([
          service.login(invited.email, password),
          service.refresh(active.refreshToken),
          service.setBlocked(actor, invited.id, true),
        ]);
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, invited.id));
        assert.equal(user.status, 'BLOCKED');
        const sessions = await db
          .select()
          .from(userSessions)
          .where(eq(userSessions.userId, invited.id));
        assert(sessions.every((session) => session.revokedAt !== null));
        await assert.rejects(
          service.authenticate(active.accessToken),
          status(401),
        );
        await service.setBlocked(actor, invited.id, false);
        memberTokens = await service.login(invited.email, password);
      },
    );

    await t.test('logout revokes access and refresh', async () => {
      await service.logout(memberTokens.refreshToken);
      await service.logout(memberTokens.refreshToken);
      await service.logout('');
      await assert.rejects(
        service.authenticate(memberTokens.accessToken),
        status(401),
      );
      await assert.rejects(
        service.refresh(memberTokens.refreshToken),
        status(401),
      );
    });

    await t.test(
      'resend and expiry invalidate invitation links and queued stale mail',
      async () => {
        const user = await service.invite(actor, {
          email: 'resend@example.test',
          firstName: 'X',
          lastName: 'Y',
          role: 'STUDENT',
        });
        const old = jobs.at(-1);
        await service.resend(actor, user.id);
        const next = jobs.at(-1);
        await assert.rejects(
          service.acceptInvitation(old.token, password),
          status(401),
        );
        let sends = 0;
        const worker = new InvitationEmailProcessor(
          services[1],
          { send: async () => sends++ },
          environment,
        );
        await worker.process({ name: 'invitation', data: old });
        assert.equal(sends, 0);
        await db
          .update(userInvitations)
          .set({ expiresAt: new Date(0) })
          .where(eq(userInvitations.id, next.invitationId));
        await assert.rejects(
          service.acceptInvitation(next.token, password),
          status(401),
        );
        await service.resend(actor, user.id);
        const beforeBlock = jobs.at(-1);
        await service.setBlocked(actor, user.id, true);
        await service.setBlocked(actor, user.id, false);
        await assert.rejects(
          service.acceptInvitation(beforeBlock.token, password),
          status(401),
        );
      },
    );

    await t.test(
      'expired sessions cannot authenticate or refresh',
      async () => {
        const tokens = await service.login(invited.email, password);
        const context = await service.authenticate(tokens.accessToken);
        await db
          .update(userSessions)
          .set({ expiresAt: new Date(0) })
          .where(eq(userSessions.id, context.sessionId));
        await assert.rejects(
          service.authenticate(tokens.accessToken),
          status(401),
        );
        await assert.rejects(service.refresh(tokens.refreshToken), status(401));
      },
    );

    await t.test(
      'delivery survives queue outage and process restart without raw tokens in storage',
      async () => {
        const failedDelivery = new InvitationDeliveryService(
          services[1],
          {
            enqueue: async () => {
              throw Error('offline');
            },
          },
          environment,
        );
        const failing = new AuthService(
          { db },
          new AccessTokenService(new JwtService(), environment),
          new PasswordService(),
          failedDelivery,
          ...services,
        );
        const user = await failing.invite(actor, {
          email: 'retry@example.test',
          firstName: 'X',
          lastName: 'Y',
          role: 'STUDENT',
        });
        const [record] = await db
          .select()
          .from(userInvitations)
          .where(eq(userInvitations.userId, user.id));
        assert.equal(record.deliveryStatus, 'pending');
        assert.equal(
          record.tokenHash,
          createHash('sha256')
            .update(services[1].deliveryToken(record.id))
            .digest('hex'),
        );
        assert.equal(record.token, undefined);
        const restarted = new InvitationDeliveryService(
          new InvitationsService(repositories[1], environment),
          queue,
          environment,
        );
        await restarted.recover();
        assert(jobs.some((job) => job.invitationId === record.id));
        let sends = 0;
        const worker = new InvitationEmailProcessor(
          services[1],
          {
            send: async () => {
              sends++;
            },
          },
          environment,
        );
        await worker.process({
          name: 'invitation',
          data: { invitationId: record.id },
          attemptsMade: 0,
          opts: { attempts: 5 },
        });
        await worker.process({
          name: 'invitation',
          data: { invitationId: record.id },
          attemptsMade: 0,
          opts: { attempts: 5 },
        });
        assert.equal(sends, 1);
        assert.equal(
          (await repositories[1].findById(record.id)).deliveryStatus,
          'sent',
        );
      },
    );

    await t.test(
      'rolling back invitation creation leaves no pending delivery',
      async () => {
        const before = await db
          .select()
          .from(userInvitations)
          .where(eq(userInvitations.userId, admin.id));
        await assert.rejects(
          db.transaction(async (tx) => {
            await services[1].issue(admin.id, tx);
            throw new Error('rollback');
          }),
          /rollback/,
        );
        const after = await db
          .select()
          .from(userInvitations)
          .where(eq(userInvitations.userId, admin.id));
        assert.deepEqual(after, before);
      },
    );

    await t.test(
      'final SMTP failure is persisted without sensitive error details',
      async () => {
        const user = await service.invite(actor, {
          email: 'smtp-failure@example.test',
          firstName: 'X',
          lastName: 'Y',
          role: 'STUDENT',
        });
        const job = jobs.at(-1);
        const worker = new InvitationEmailProcessor(
          services[1],
          {
            send: async () => {
              throw Object.assign(new Error('secret-token-and-password'), {
                code: 'EAUTH',
              });
            },
          },
          environment,
        );
        await assert.rejects(
          worker.process({
            name: 'invitation',
            data: { invitationId: job.invitationId },
            attemptsMade: 4,
            opts: { attempts: 5 },
          }),
          /^Error: EAUTH$/,
        );
        const record = await repositories[1].findById(job.invitationId);
        assert.equal(record.deliveryStatus, 'failed');
        assert.equal(record.deliveryError, 'EAUTH');
        assert.equal(record.deliveryAttempts, 1);
        assert(
          !(await services[1].pendingDeliveries()).some(
            (i) => i.id === record.id,
          ),
        );
        await service.resend(actor, user.id);
        assert.notEqual(jobs.at(-1).invitationId, record.id);
      },
    );

    const recovery = new PasswordRecoveryService(
      { db },
      services[0],
      services[3],
      services[2],
      new PasswordService(),
      environment,
    );
    const recoveryUser = await services[0].create({
      email: 'recovery@example.test',
      firstName: '<Recovery>',
      lastName: 'Test',
      role: 'STUDENT',
      status: 'ACTIVE',
      passwordHash,
    });
    const resetRows = () =>
      db
        .select()
        .from(passwordResets)
        .where(eq(passwordResets.userId, recoveryUser.id));
    const resetToken = (row) => services[3].deliveryToken(row.id);
    const nextReset = async () => {
      await db
        .update(passwordResets)
        .set({ createdAt: new Date(Date.now() - 120000) })
        .where(eq(passwordResets.userId, recoveryUser.id));
      await recovery.request(recoveryUser.email);
      return (await resetRows()).find((row) => !row.usedAt && !row.revokedAt);
    };
    const newPassword = 'new recovery password';
    await t.test(
      'recovery hides eligibility and serializes concurrent requests during cooldown',
      async () => {
        const expected = await recovery.request('missing@example.test');
        for (const state of ['INVITED', 'BLOCKED']) {
          const user = await services[0].create({
            email: `${state.toLowerCase()}-recovery@example.test`,
            firstName: 'X',
            lastName: 'Y',
            role: 'STUDENT',
            status: state,
            passwordHash,
          });
          assert.deepEqual(await recovery.request(user.email), expected);
          assert.equal(
            (
              await db
                .select()
                .from(passwordResets)
                .where(eq(passwordResets.userId, user.id))
            ).length,
            0,
          );
        }
        for (const result of await Promise.all([
          recovery.request(recoveryUser.email),
          recovery.request(recoveryUser.email),
        ]))
          assert.deepEqual(result, expected);
        const rows = await resetRows();
        assert.equal(rows.length, 1);
        assert.equal(
          rows[0].tokenHash,
          createHash('sha256').update(resetToken(rows[0])).digest('hex'),
        );
        assert.equal(JSON.stringify(rows).includes(resetToken(rows[0])), false);
        assert.equal(
          (await services[0].getByIdOrThrow(recoveryUser.id)).passwordHash,
          passwordHash,
        );
        assert.deepEqual(await recovery.request(admin.email), expected);
        assert.equal(
          (
            await db
              .select()
              .from(passwordResets)
              .where(eq(passwordResets.userId, admin.id))
          ).length,
          1,
        );
      },
    );
    await t.test(
      'recovery survives queue outage, sends escaped fragment links and routes email jobs',
      async () => {
        const queued = [];
        const failed = new PasswordResetDeliveryService(
          services[3],
          {
            enqueue: async () => {
              throw Error('offline');
            },
          },
          environment,
        );
        await failed.recover();
        assert.equal((await resetRows())[0].deliveryStatus, 'pending');
        const dispatcher = new PasswordResetDeliveryService(
          services[3],
          {
            enqueue: async (name, type, data, options) => {
              assert.equal(name, 'email');
              assert.equal(type, 'password-reset');
              assert.equal(options.jobId, `${type}-${data.resetId}`);
              assert.deepEqual(Object.keys(data).sort(), [
                'requestId',
                'resetId',
              ]);
              queued.push({
                name: type,
                data,
                opts: { attempts: 5 },
                attemptsMade: 0,
              });
            },
          },
          environment,
        );
        await dispatcher.recover();
        const sent = [];
        const processor = new PasswordResetEmailProcessor(
          services[3],
          { send: async (email) => sent.push(email) },
          environment,
        );
        const router = new AuthEmailProcessor(
          { process: async () => sent.push('invitation') },
          processor,
        );
        const row = (await resetRows())[0];
        await router.process(
          queued.find((item) => item.data.resetId === row.id),
        );
        assert.equal(sent.length, 1);
        assert.match(
          sent[0].text,
          new RegExp(`/reset-password#token=${resetToken(row)}`),
        );
        assert.match(sent[0].html, /&lt;Recovery&gt;/);
        assert.equal((await resetRows())[0].deliveryStatus, 'sent');
        await router.process(
          queued.find((item) => item.data.resetId === row.id),
        );
        assert.equal(sent.length, 1);
        await router.process({ name: 'invitation' });
        assert.equal(sent.at(-1), 'invitation');
        await assert.rejects(
          async () => router.process({ name: 'unknown' }),
          /Unsupported/,
        );
      },
    );
    await t.test(
      'new recovery link invalidates old links and expiry is enforced',
      async () => {
        const first = (await resetRows())[0];
        const second = await nextReset();
        await assert.rejects(
          recovery.reset(resetToken(first), newPassword),
          status(401),
        );
        await repositories[3].update(second.id, {
          expiresAt: new Date(Date.now() - 1000),
        });
        await assert.rejects(
          recovery.reset(resetToken(second), newPassword),
          status(401),
        );
        assert.equal(await services[3].prepareDelivery(second.id), null);
        assert.equal(
          (await repositories[3].findById(second.id)).deliveryStatus,
          'skipped',
        );
      },
    );
    await t.test(
      'concurrent password reset succeeds once, revokes every session and schedules confirmation',
      async () => {
        const row = await nextReset();
        const sessions = await Promise.all([
          service.login(recoveryUser.email, password),
          service.login(recoveryUser.email, password),
        ]);
        const results = await Promise.allSettled([
          recovery.reset(resetToken(row), newPassword),
          recovery.reset(resetToken(row), newPassword),
        ]);
        assert.equal(
          results.filter((result) => result.status === 'fulfilled').length,
          1,
        );
        assert.equal(
          results
            .find((result) => result.status === 'rejected')
            .reason.getStatus(),
          401,
        );
        for (const tokens of sessions) {
          await assert.rejects(
            service.authenticate(tokens.accessToken),
            status(401),
          );
          await assert.rejects(
            service.refresh(tokens.refreshToken),
            status(401),
          );
        }
        await assert.rejects(
          service.login(recoveryUser.email, password),
          status(401),
        );
        assert.equal(
          (await service.login(recoveryUser.email, newPassword)).user.id,
          recoveryUser.id,
        );
        const stored = await repositories[3].findById(row.id);
        assert(stored.usedAt);
        assert.equal(stored.notificationStatus, 'pending');
        const jobs = [];
        const dispatcher = new PasswordResetDeliveryService(
          services[3],
          {
            enqueue: async (_, name, data) =>
              jobs.push({ name, data, opts: { attempts: 5 }, attemptsMade: 0 }),
          },
          environment,
        );
        await dispatcher.recover();
        const confirmation = jobs.find(
          (job) =>
            job.name === 'password-changed' && job.data.resetId === row.id,
        );
        assert(confirmation);
        const emails = [];
        await new PasswordResetEmailProcessor(
          services[3],
          { send: async (mail) => emails.push(mail) },
          environment,
        ).process(confirmation);
        assert.equal(emails.length, 1);
        assert.equal(JSON.stringify(emails).includes(newPassword), false);
        assert.equal(
          (await repositories[3].findById(row.id)).notificationStatus,
          'sent',
        );
      },
    );
    await t.test(
      'reset rolls back token, password and notification on session revocation failure',
      async () => {
        const row = await nextReset();
        const failing = new PasswordRecoveryService(
          { db },
          services[0],
          services[3],
          {
            revokeForUser: async () => {
              throw Error('injected failure');
            },
          },
          new PasswordService(),
          environment,
        );
        await assert.rejects(
          failing.reset(resetToken(row), password),
          /injected failure/,
        );
        const stored = await repositories[3].findById(row.id);
        assert.equal(stored.usedAt, null);
        assert.equal(stored.notificationStatus, null);
        assert.equal(
          (await service.login(recoveryUser.email, newPassword)).user.id,
          recoveryUser.id,
        );
        await service.setBlocked(actor, recoveryUser.id, true);
        await assert.rejects(
          recovery.reset(resetToken(row), password),
          status(401),
        );
        await service.setBlocked(actor, recoveryUser.id, false);
        await assert.rejects(
          recovery.reset(resetToken(row), password),
          status(401),
        );
      },
    );
    await t.test(
      'SMTP failures retain safe diagnostics and exhaust recovery retries',
      async () => {
        const row = await nextReset();
        const processor = new PasswordResetEmailProcessor(
          services[3],
          {
            send: async () => {
              throw Object.assign(Error('secret SMTP payload'), {
                code: 'ECONNECTION',
              });
            },
          },
          environment,
        );
        const job = {
          name: 'password-reset',
          data: { resetId: row.id },
          opts: { attempts: 5 },
          attemptsMade: 0,
        };
        await assert.rejects(processor.process(job), /^Error: ECONNECTION$/);
        assert.equal(
          (await repositories[3].findById(row.id)).deliveryStatus,
          'pending',
        );
        await assert.rejects(
          processor.process({ ...job, attemptsMade: 4 }),
          /^Error: ECONNECTION$/,
        );
        const stored = await repositories[3].findById(row.id);
        assert.equal(stored.deliveryStatus, 'failed');
        assert.equal(stored.deliveryError, 'ECONNECTION');
        assert.equal(stored.deliveryAttempts, 2);
      },
    );

    await t.test(
      'HTTP guards, validation, cookies, origin checks and throttling',
      async () => {
        class FakeEmailModule {}
        Module({})(FakeEmailModule);
        class FakeQueueModule {}
        Module({
          providers: [{ provide: QueueService, useValue: queue }],
          exports: [QueueService],
        })(FakeQueueModule);
        const module = await Test.createTestingModule({ imports: [AuthModule] })
          .overrideModule(EmailModule)
          .useModule(FakeEmailModule)
          .overrideModule(QueueModule)
          .useModule(FakeQueueModule)
          .overrideProvider(InvitationDeliveryService)
          .useValue(delivery)
          .overrideProvider(InvitationEmailProcessor)
          .useValue({})
          .overrideProvider(PasswordResetEmailProcessor)
          .useValue({})
          .overrideProvider(AuthEmailProcessor)
          .useValue({})
          .overrideProvider(PasswordResetDeliveryService)
          .useValue({})
          .overrideProvider(DatabaseService)
          .useValue({ db })
          .overrideProvider(EnvironmentService)
          .useValue(environment)
          .compile();
        app = module.createNestApplication();
        app.useGlobalPipes(
          new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
          }),
        );
        app.useGlobalInterceptors(new ResponseInterceptor());
        app.useGlobalFilters(new AllExceptionFilter());
        await app.init();
        const http = request(app.getHttpServer());
        for (const route of ['/auth/forgot-password', '/auth/reset-password']) {
          await http
            .post(route)
            .set('Origin', 'https://evil.example')
            .send({})
            .expect(403);
        }
        await http
          .post('/auth/forgot-password')
          .send({ email: 'invalid' })
          .expect(400);
        let generic;
        for (const email of [
          recoveryUser.email.toUpperCase(),
          'missing@example.test',
          'invited-recovery@example.test',
          'blocked-recovery@example.test',
        ]) {
          const response = await http
            .post('/auth/forgot-password')
            .send({ email })
            .expect(200);
          assert.equal(response.headers['cache-control'], 'no-store');
          assert.equal(response.headers['set-cookie'], undefined);
          if (generic) assert.deepEqual(response.body, generic);
          generic = response.body;
        }
        await http
          .post('/auth/forgot-password')
          .send({ email: recoveryUser.email })
          .expect(429);
        await http
          .post('/auth/reset-password')
          .send({ token: 'a'.repeat(64), password: 'short' })
          .expect(400);
        await http
          .post('/auth/reset-password')
          .send({ token: 'invalid', password })
          .expect(400);
        const httpReset = await nextReset();
        const resetResponse = await http
          .post('/auth/reset-password')
          .send({ token: resetToken(httpReset), password: newPassword })
          .expect(200);
        assert.equal(resetResponse.headers['cache-control'], 'no-store');
        assert.equal(resetResponse.headers['set-cookie'].length, 2);
        for (const cookie of resetResponse.headers['set-cookie']) {
          assert.match(cookie, /HttpOnly/);
          assert.match(cookie, /Expires=Thu, 01 Jan 1970/);
        }
        assert.deepEqual(Object.keys(resetResponse.body.detail), ['message']);
        await http
          .post('/auth/reset-password')
          .send({ token: resetToken(httpReset), password })
          .expect(401);
        await http
          .post('/auth/reset-password')
          .send({ token: 'a'.repeat(64), password })
          .expect(401);
        await http
          .post('/auth/reset-password')
          .send({ token: 'a'.repeat(64), password })
          .expect(429);
        const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
        const document = SwaggerModule.createDocument(
          app,
          new DocumentBuilder().build(),
        );
        for (const route of ['/auth/forgot-password', '/auth/reset-password']) {
          assert(document.paths[route].post.requestBody);
          assert(document.paths[route].post.responses['200']);
          assert.equal(document.paths[route].post.security, undefined);
        }
        assert.equal(
          document.components.schemas.ResetPasswordDto.properties.password
            .maxLength,
          64,
        );

        await http.get('/auth/me').expect(401);
        const login = await http
          .post('/auth/login')
          .set('Origin', 'http://localhost:3000')
          .send({ email: admin.email, password })
          .expect(200);
        const body = login.body.detail;
        assert.equal('refreshToken' in body, false);
        assert.equal('passwordHash' in body.user, false);
        assert.equal('accessToken' in body, false);
        const cookies = login.headers['set-cookie'];
        const cookie = cookies.find((value) =>
          value.startsWith('refresh_token='),
        );
        const accessCookie = cookies.find((value) =>
          value.startsWith('access_token='),
        );
        assert.match(accessCookie, /HttpOnly/);
        assert.match(accessCookie, /SameSite=Strict/);
        assert.match(accessCookie, /Path=\/;/);
        assert.match(accessCookie, /Max-Age=900/);
        const cookieHeader = cookies
          .map((value) => value.split(';')[0])
          .join('; ');
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Strict/);
        assert.match(cookie, /Path=\/auth/);
        assert.equal(login.headers['cache-control'], 'no-store');
        await http.get('/auth/me').set('Cookie', cookieHeader).expect(200);
        await http
          .get('/auth/me')
          .set(
            'Authorization',
            `Bearer ${accessCookie.split(';')[0].slice('access_token='.length)}`,
          )
          .expect(401);
        for (const route of [
          '/auth/invitations',
          `/auth/users/${admin.id}/block`,
          '/auth/logout',
        ]) {
          await http
            .post(route)
            .set('Cookie', cookieHeader)
            .set('Origin', 'https://evil.example')
            .expect(403);
        }
        await http
          .post('/auth/invitations')
          .set('Cookie', cookieHeader)
          .set('Sec-Fetch-Site', 'cross-site')
          .expect(403);
        await http
          .post('/auth/invitations')
          .set('Cookie', cookieHeader)
          .send({
            email: 'admin2@example.test',
            firstName: 'X',
            lastName: 'Y',
            role: 'ADMIN',
          })
          .expect(400);
        await http
          .post('/auth/invitations/accept')
          .send({ token: 'a'.repeat(64), password: 'short' })
          .expect(400);
        await http
          .post('/auth/refresh')
          .set('Cookie', cookie)
          .set('Origin', 'https://evil.example')
          .expect(403);
        const refreshed = await http
          .post('/auth/refresh')
          .set('Cookie', cookie)
          .set('Origin', environment.frontendOrigin)
          .expect(200);
        await http.post('/auth/refresh').set('Cookie', cookie).expect(401);
        const logout = await http
          .post('/auth/logout')
          .set(
            'Cookie',
            refreshed.headers['set-cookie']
              .find((c) => c.startsWith('refresh_token='))
              .split(';')[0] + '; access_token=expired',
          )
          .expect(200);
        await http.post('/auth/logout').expect(200);
        assert.equal(logout.headers['set-cookie'].length, 2);
        for (const cleared of logout.headers['set-cookie']) {
          assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
          assert.match(cleared, /HttpOnly/);
        }
        await http.get('/auth/me').set('Cookie', cookieHeader).expect(401);
        for (let i = 0; i < 4; i++)
          await http
            .post('/auth/login')
            .send({ email: admin.email, password: 'incorrect' })
            .expect(401);
        await http
          .post('/auth/login')
          .send({ email: admin.email, password: 'incorrect' })
          .expect(429);
      },
    );
  } finally {
    if (app) await app.close();
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});

test('Swagger origin is allowed only in development on the configured API port', () => {
  const context = (origin, site = 'same-origin') => ({
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        headers: { origin, 'sec-fetch-site': site },
      }),
    }),
  });
  for (const mode of ['development', 'production', 'test']) {
    const environment = new EnvironmentService(
      new ConfigService({
        NODE_ENV: mode,
        APP_PORT: 3000,
        FRONTEND_ORIGIN: 'http://localhost:3001',
      }),
    );
    const guard = new CsrfGuard(environment);
    assert.equal(guard.canActivate(context('http://localhost:3001')), true);
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000']) {
      if (mode === 'development')
        assert.equal(guard.canActivate(context(origin)), true);
      else assert.throws(() => guard.canActivate(context(origin)), status(403));
    }
    for (const origin of [
      'http://localhost:4000',
      'https://evil.example',
      'null',
    ])
      assert.throws(() => guard.canActivate(context(origin)), status(403));
    assert.throws(
      () => guard.canActivate(context('http://localhost:3001', 'cross-site')),
      status(403),
    );
  }
});
