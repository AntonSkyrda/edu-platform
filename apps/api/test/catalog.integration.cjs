const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { Readable } = require('node:stream');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const databaseRequire = createRequire(
  resolve('../../packages/database/package.json'),
);
databaseRequire('dotenv').config({ path: '../../.env', quiet: true });
require('reflect-metadata');
const {
  ValidationPipe,
  UnauthorizedException,
  Module,
} = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
const { Test } = require('@nestjs/testing');
const { PERMISSIONS } = require('@project/contracts');
const { createDatabase, createDatabaseUrl } = require('@project/database');
const { eq } = require('@project/database');
const { users, userPermissions } = require('@project/database/schema');
const request = require('supertest');

const { CatalogModule } = require('../dist/catalog/catalog.module');
const {
  SubjectsRepository,
} = require('../dist/catalog/repositories/subjects.repository');
const {
  AllExceptionFilter,
} = require('../dist/common/filters/all-exception.filter');
const { AuthGuard } = require('../dist/common/guards/auth.guard');
const { CsrfGuard } = require('../dist/common/guards/csrf.guard');
const {
  ResponseInterceptor,
} = require('../dist/common/interceptors/response.interceptor');
const { DatabaseService } = require('../dist/database/database.service');
const { QueueModule } = require('../dist/infrastructure/queue/queue.module');
const {
  StorageService,
} = require('../dist/infrastructure/storage/storage.service');
const {
  MediaCleanupProcessor,
} = require('../dist/media/processors/media-cleanup.processor');
const {
  MediaCleanupScheduler,
} = require('../dist/media/services/media-cleanup-scheduler.service');
const {
  MediaCleanupService,
} = require('../dist/media/services/media-cleanup.service');
const { MediaService } = require('../dist/media/services/media.service');
class EmptyQueueModule {}
Module({})(EmptyQueueModule);
test('catalog API against isolated PostgreSQL schema', async (t) => {
  const env = process.env;
  assert(
    ['localhost', '127.0.0.1'].includes(env.POSTGRES_HOST),
    'Local database only',
  );
  const schema = `catalog_test_${randomUUID().replaceAll('-', '')}`;
  const { db, pool } = createDatabase({
    application_name: schema,
    connectionString: createDatabaseUrl({
      host: env.POSTGRES_HOST,
      port: Number(env.POSTGRES_PORT),
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB,
      schema,
    }),
  });
  let app;
  const objects = new Map();
  let failStorage = false;
  let failDeletion = false;
  const storage = {
    put: async (_driver, key, body) => {
      if (failStorage) throw new Error('Offline');
      objects.set(key, body);
    },
    read: async (_driver, key) => {
      if (!objects.has(key)) throw new Error('Missing');
      return Readable.from(objects.get(key));
    },
    delete: async (_driver, key) => {
      if (failDeletion) throw new Error('Offline');
      objects.delete(key);
    },
  };
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const journal = JSON.parse(
      readFileSync(
        '../../packages/database/migrations/meta/_journal.json',
        'utf8',
      ),
    );
    for (const entry of journal.entries)
      await pool.query(
        readFileSync(
          `../../packages/database/migrations/${entry.tag}.sql`,
          'utf8',
        ).replaceAll('"public".', `"${schema}".`),
      );
    const managerId = randomUUID();
    await db.insert(users).values({
      id: managerId,
      email: 'manager@catalog.test',
      firstName: 'Test',
      lastName: 'Manager',
      role: 'MANAGER',
      status: 'ACTIVE',
    });
    const grant = async (permissions) => {
      await db
        .delete(userPermissions)
        .where(eq(userPermissions.userId, managerId));
      if (permissions.length)
        await db.insert(userPermissions).values(
          permissions.map((permission) => ({
            userId: managerId,
            permission,
          })),
        );
    };
    await grant(PERMISSIONS);
    const module = await Test.createTestingModule({ imports: [CatalogModule] })
      .overrideModule(QueueModule)
      .useModule(EmptyQueueModule)
      .overrideProvider(MediaCleanupProcessor)
      .useValue({})
      .overrideProvider(MediaCleanupScheduler)
      .useValue({})
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(DatabaseService)
      .useValue({ db })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionFilter());
    app.useGlobalGuards(
      new AuthGuard(new Reflector(), {
        authenticate: async (token) => {
          if (
            !['ADMIN', 'MANAGER', 'TEACHER', 'STUDENT', 'BLOCKED'].includes(
              token,
            )
          )
            throw new UnauthorizedException();
          return {
            user: {
              id: managerId,
              role: token === 'BLOCKED' ? 'MANAGER' : token,
              status: token === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE',
            },
          };
        },
      }),
      new CsrfGuard({ trustedRequestOrigins: ['http://localhost:3001'] }),
    );
    await app.init();
    await app.listen(0, '127.0.0.1');
    const http = request(app.getHttpServer());
    const versions = new Map();
    const editor = (method, path) => {
      const id = path.match(/^\/admin\/(?:subjects|teachers)\/([^/]+)/)?.[1];
      const req = http[method](path)
        .set('Cookie', 'access_token=MANAGER')
        .set('Origin', 'http://localhost:3001')
        .on('response', (response) => {
          const detail = response.body?.detail;
          if (detail?.version) versions.set(detail.id ?? id, detail.version);
          for (const row of detail?.items ?? [])
            if (row.id && row.version) versions.set(row.id, row.version);
        });
      if (id && ['patch', 'put', 'delete'].includes(method))
        req.send({ expectedVersion: versions.get(id) ?? 1 });
      return req;
    };
    await t.test(
      'manager grants are required per action and revocation applies on next request',
      async () => {
        await grant([]);
        await editor('get', '/admin/subjects').expect(403);
        await editor('post', '/admin/media/images').expect(403);
        await grant(['subjects.read']);
        await editor('get', '/admin/subjects').expect(200);
        await editor('post', '/admin/subjects')
          .send({ name: 'Denied' })
          .expect(403);
        await editor('get', '/admin/teachers').expect(403);
        await grant([]);
        await editor('get', '/admin/subjects').expect(403);
        await grant(PERMISSIONS);
      },
    );
    await t.test(
      'editing published content requires publish permission',
      async () => {
        const created = await editor('post', '/admin/subjects')
          .send({
            name: 'Protected',
          })
          .expect(201);
        const id = created.body.detail.id;
        await editor('patch', `/admin/subjects/${id}/status`)
          .send({ status: 'PUBLISHED' })
          .expect(200);
        await grant(['subjects.update']);
        await editor('patch', `/admin/subjects/${id}`)
          .send({ name: 'Denied edit' })
          .expect(403);
        const unchanged = await http
          .get('/catalog/subjects/protected')
          .expect(200);
        assert.equal(unchanged.body.detail.name, 'Protected');
        await editor('patch', `/admin/subjects/${id}/status`)
          .send({ status: 'DRAFT' })
          .expect(403);
        await grant(PERMISSIONS);
        await editor('delete', `/admin/subjects/${id}`).expect(200);
      },
    );
    const mediaService = app.get(MediaService);
    const cleanup = app.get(MediaCleanupService);
    const image = await sharp({
      create: { width: 20, height: 10, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    const photo = await mediaService.upload(image, 'IMAGE');
    const explicit = (method, path) =>
      http[method](path)
        .set('Cookie', 'access_token=MANAGER')
        .set('Origin', 'http://localhost:3001');
    await t.test(
      'record versions reject stale writes and require explicit valid versions',
      async () => {
        const created = (
          await editor('post', '/admin/subjects')
            .send({ name: 'Version audit' })
            .expect(201)
        ).body.detail;
        assert.equal(created.version, 1);
        const path = `/admin/subjects/${created.id}`;
        for (const expectedVersion of [undefined, null, 0, -1, 1.5, '1']) {
          await explicit('patch', path)
            .send({ name: 'Invalid', expectedVersion })
            .expect(400);
        }
        await explicit('patch', path).send({ expectedVersion: 1 }).expect(400);
        await explicit('patch', `${path}/status`)
          .send({ status: 'PUBLISHED' })
          .expect(400);
        const results = await Promise.all([
          explicit('patch', path).send({
            name: 'Editor A',
            expectedVersion: 1,
          }),
          explicit('patch', path).send({ sortOrder: 7, expectedVersion: 1 }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        assert.equal(
          results.find((r) => r.status === 409).body.code,
          'VERSION_CONFLICT',
        );
        const actual = (await editor('get', path).expect(200)).body.detail;
        assert.equal(actual.version, 2);
        await explicit('patch', `${path}/status`)
          .send({ status: 'PUBLISHED', expectedVersion: 1 })
          .expect(409);
        assert.deepEqual(
          (await editor('get', path).expect(200)).body.detail,
          actual,
        );
        const published = (
          await explicit('patch', `${path}/status`)
            .send({ status: 'PUBLISHED', expectedVersion: 2 })
            .expect(200)
        ).body.detail;
        assert.equal(published.version, 3);
        await explicit('delete', path)
          .send({ expectedVersion: published.version })
          .expect(200);
      },
    );
    await t.test(
      'teacher conflicts preserve newer content and do not change uploaded photo expiry',
      async () => {
        const created = (
          await editor('post', '/admin/teachers')
            .send({
              firstName: 'Audit',
              lastName: 'Teacher',
              shortDescription: 'Original',
            })
            .expect(201)
        ).body.detail;
        const path = `/admin/teachers/${created.id}`;
        const upload = await mediaService.upload(image, 'IMAGE');
        const expiry = (
          await pool.query('SELECT expires_at FROM media WHERE id = $1', [
            upload.id,
          ])
        ).rows[0].expires_at;
        const results = await Promise.all([
          explicit('patch', path).send({
            shortDescription: 'Editor A',
            expectedVersion: 1,
          }),
          explicit('patch', path).send({
            shortDescription: 'Editor B',
            expectedVersion: 1,
          }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const winner = results.find((r) => r.status === 200).body.detail;
        const stale = await explicit('patch', path)
          .send({
            shortDescription: 'Original',
            photoId: upload.id,
            expectedVersion: 1,
          })
          .expect(409);
        assert.equal(stale.body.code, 'VERSION_CONFLICT');
        assert.deepEqual(
          (await editor('get', path).expect(200)).body.detail,
          winner,
        );
        assert.equal(
          (
            await pool.query('SELECT expires_at FROM media WHERE id = $1', [
              upload.id,
            ])
          ).rows[0].expires_at.getTime(),
          expiry.getTime(),
        );
        const saved = (
          await explicit('patch', path)
            .send({
              biography: 'Reviewed changes',
              expectedVersion: winner.version,
            })
            .expect(200)
        ).body.detail;
        assert.equal(saved.version, 3);
        await explicit('delete', path)
          .send({ expectedVersion: saved.version })
          .expect(200);
        await mediaService.remove(upload.id);
      },
    );
    await t.test(
      'deletion requires a valid version and stale deletes preserve records, assignments and media',
      async () => {
        const subject = (
          await editor('post', '/admin/subjects')
            .send({ name: 'Protected delete' })
            .expect(201)
        ).body.detail;
        const upload = await mediaService.upload(image, 'IMAGE');
        const teacher = (
          await editor('post', '/admin/teachers')
            .send({
              firstName: 'Protected',
              lastName: 'Delete',
              photoId: upload.id,
            })
            .expect(201)
        ).body.detail;
        const subjectPath = `/admin/subjects/${subject.id}`;
        const teacherPath = `/admin/teachers/${teacher.id}`;
        for (const path of [subjectPath, teacherPath]) {
          for (const expectedVersion of [
            undefined,
            null,
            0,
            -1,
            1.5,
            '1',
            2147483648,
          ])
            await explicit('delete', path)
              .send({ expectedVersion })
              .expect(400);
        }
        await editor('put', `${teacherPath}/subjects`)
          .send({ subjects: [{ subjectId: subject.id, sortOrder: 0 }] })
          .expect(200);
        await editor('patch', subjectPath)
          .send({ name: 'Newer subject' })
          .expect(200);
        const expiryBefore = (
          await pool.query('SELECT expires_at FROM media WHERE id = $1', [
            upload.id,
          ])
        ).rows[0].expires_at;
        for (const path of [subjectPath, teacherPath]) {
          const conflict = await explicit('delete', path)
            .send({ expectedVersion: 1 })
            .expect(409);
          assert.equal(conflict.body.code, 'VERSION_CONFLICT');
          await editor('get', path).expect(200);
        }
        assert.deepEqual(
          (await editor('get', `${teacherPath}/subjects`)).body.detail.items,
          [{ subjectId: subject.id, sortOrder: 0 }],
        );
        assert.equal(
          (
            await pool.query('SELECT expires_at FROM media WHERE id = $1', [
              upload.id,
            ])
          ).rows[0].expires_at,
          expiryBefore,
        );
        await editor('delete', teacherPath).expect(200);
        await editor('delete', subjectPath).expect(200);
        await mediaService.remove(upload.id);
      },
    );
    await t.test(
      'parallel edits and deletes have exactly one winner; duplicate deletes never both succeed',
      async () => {
        for (const resource of ['subjects', 'teachers']) {
          const create = async () =>
            (
              await editor('post', `/admin/${resource}`)
                .send(
                  resource === 'subjects'
                    ? { name: 'Concurrent deletion' }
                    : { firstName: 'Concurrent', lastName: 'Deletion' },
                )
                .expect(201)
            ).body.detail;
          const row = await create();
          const path = `/admin/${resource}/${row.id}`;
          const [updated, removed] = await Promise.all([
            explicit('patch', path).send({
              expectedVersion: row.version,
              ...(resource === 'subjects'
                ? { name: 'Winner' }
                : { biography: 'Winner' }),
            }),
            explicit('delete', path).send({ expectedVersion: row.version }),
          ]);
          assert.equal(
            [updated, removed].filter((r) => r.status === 200).length,
            1,
          );
          if (updated.status === 200) {
            assert.equal(removed.status, 409);
            assert.equal(removed.body.code, 'VERSION_CONFLICT');
            assert.deepEqual(
              (await editor('get', path)).body.detail,
              updated.body.detail,
            );
            await editor('delete', path).expect(200);
          } else {
            assert.equal(updated.status, 404);
            await editor('get', path).expect(404);
          }
          const duplicate = await create();
          const duplicatePath = `/admin/${resource}/${duplicate.id}`;
          const results = await Promise.all(
            [1, 2].map(() =>
              explicit('delete', duplicatePath).send({
                expectedVersion: duplicate.version,
              }),
            ),
          );
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 404]);
        }
      },
    );
    await t.test(
      'parallel teacher assignment replacement and deletion cannot both succeed',
      async () => {
        const subject = (
          await editor('post', '/admin/subjects')
            .send({ name: 'Delete versus assignments' })
            .expect(201)
        ).body.detail;
        const teacher = (
          await editor('post', '/admin/teachers')
            .send({ firstName: 'Assignments', lastName: 'Race' })
            .expect(201)
        ).body.detail;
        const path = `/admin/teachers/${teacher.id}`;
        const [assigned, removed] = await Promise.all([
          explicit('put', `${path}/subjects`).send({
            expectedVersion: 1,
            subjects: [{ subjectId: subject.id, sortOrder: 0 }],
          }),
          explicit('delete', path).send({ expectedVersion: 1 }),
        ]);
        assert.equal(
          [assigned, removed].filter((r) => r.status === 200).length,
          1,
        );
        if (assigned.status === 200) {
          assert.equal(removed.status, 409);
          assert.deepEqual(
            (await editor('get', `${path}/subjects`)).body.detail,
            assigned.body.detail,
          );
          await editor('delete', path).expect(200);
        } else assert.equal(assigned.status, 404);
        await editor('delete', `/admin/subjects/${subject.id}`).expect(200);
      },
    );
    await t.test(
      'assignment replacements share the teacher version and reject stale lists atomically',
      async () => {
        const subject = (
          await editor('post', '/admin/subjects')
            .send({ name: 'Versioned assignment' })
            .expect(201)
        ).body.detail;
        const teacher = (
          await editor('post', '/admin/teachers')
            .send({ firstName: 'Assignment', lastName: 'Audit' })
            .expect(201)
        ).body.detail;
        const path = `/admin/teachers/${teacher.id}`;
        const initial = (await editor('get', `${path}/subjects`).expect(200))
          .body.detail;
        assert.deepEqual(initial, { items: [], version: 1 });
        await explicit('put', `${path}/subjects`)
          .send({ subjects: [] })
          .expect(400);
        const results = await Promise.all([
          explicit('put', `${path}/subjects`).send({
            subjects: [{ subjectId: subject.id, sortOrder: 1 }],
            expectedVersion: 1,
          }),
          explicit('put', `${path}/subjects`).send({
            subjects: [{ subjectId: subject.id, sortOrder: 2 }],
            expectedVersion: 1,
          }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const winner = results.find((r) => r.status === 200).body.detail;
        assert.equal(winner.version, 2);
        await explicit('put', `${path}/subjects`)
          .send({ subjects: [], expectedVersion: 1 })
          .expect(409);
        assert.deepEqual(
          (await editor('get', `${path}/subjects`).expect(200)).body.detail,
          winner,
        );
        await explicit('patch', path)
          .send({ firstName: 'Stale', expectedVersion: 1 })
          .expect(409);
        assert.equal(
          (await editor('get', path).expect(200)).body.detail.version,
          2,
        );
        await editor('delete', path).expect(200);
        await editor('delete', `/admin/subjects/${subject.id}`).expect(200);
      },
    );
    let subject;
    let teacher;
    let second;
    const createSubject = async () =>
      (
        await editor('post', '/admin/subjects')
          .send({ name: 'Cascade test' })
          .expect(201)
      ).body.detail;
    const createTeacher = async () =>
      (
        await editor('post', '/admin/teachers')
          .send({ firstName: 'Cascade', lastName: 'Test' })
          .expect(201)
      ).body.detail;
    const assignments = (teacher) => `/admin/teachers/${teacher.id}/subjects`;
    const subjectPath = (subject) => `/admin/subjects/${subject.id}`;
    const teacherPath = (teacher) => `/admin/teachers/${teacher.id}`;
    const assign = async (teacher, subjects) =>
      (
        await editor('put', assignments(teacher))
          .send({
            subjects: subjects.map((subject, sortOrder) => ({
              subjectId: subject.id,
              sortOrder,
            })),
          })
          .expect(200)
      ).body.detail;
    const readAssignments = async (teacher) =>
      (await editor('get', assignments(teacher)).expect(200)).body.detail;
    const removeTeacher = async (teacher) => {
      await editor('get', teacherPath(teacher)).expect(200);
      await editor('delete', teacherPath(teacher)).expect(200);
    };
    // Force overlap at real PostgreSQL locks, rather than relying on request timing.
    // Only connections belonging to this isolated test schema are observed.
    async function withTeacherLock(teacher, run) {
      const owner = await pool.connect();
      const pending = [];
      let released = false;
      const release = async () => {
        if (!released) {
          released = true;
          await owner.query('ROLLBACK');
        }
      };
      try {
        await owner.query('BEGIN');
        await owner.query('SELECT id FROM teachers WHERE id=$1 FOR UPDATE', [
          teacher.id,
        ]);
        await run({
          start(req) {
            const operation = req.timeout({ deadline: 6000 }).then(
              (response) => response,
              (error) => ({ status: 0, error }),
            );
            pending.push(operation);
            return operation;
          },
          async waitForWaiters(count) {
            const end = Date.now() + 3000;
            while (Date.now() < end) {
              const result = await pool.query(
                "SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",
                [schema],
              );
              if (result.rows[0].count >= count) return;
              await delay(10);
            }
            assert.fail(
              `Expected ${count} concurrent requests waiting on database locks`,
            );
          },
          release,
        });
      } finally {
        await release();
        await Promise.all(pending);
        owner.release();
      }
    }
    await t.test(
      'subject deletion atomically bumps only affected teachers and stale writes return version conflicts',
      async () => {
        const a = await createSubject();
        const b = await createSubject();
        const x = await createTeacher();
        const y = await createTeacher();
        const untouched = await createTeacher();
        const initial = await assign(x, [a, b]);
        await assign(y, [a]);
        await assign(untouched, [b]);
        const snapshot = (await editor('get', teacherPath(x)).expect(200)).body
          .detail;
        await explicit('delete', subjectPath(a))
          .send({ expectedVersion: 999 })
          .expect(409);
        assert.deepEqual(await readAssignments(x), initial);
        const repository = app.get(SubjectsRepository);
        const originalDelete = repository.delete.bind(repository);
        const fail = t.mock.method(repository, 'delete', async (...args) => {
          await originalDelete(...args);
          throw new Error('Test failure after the cascade');
        });
        try {
          await editor('delete', subjectPath(a)).expect(500);
        } finally {
          fail.mock.restore();
        }
        await editor('get', subjectPath(a)).expect(200);
        assert.deepEqual(await readAssignments(x), initial);
        assert.equal((await readAssignments(y)).version, 2);
        assert.deepEqual(
          (await editor('get', teacherPath(x))).body.detail,
          snapshot,
        );
        await editor('delete', subjectPath(a)).expect(200);
        const current = await readAssignments(x);
        assert.deepEqual(current, {
          version: 3,
          items: [{ subjectId: b.id, sortOrder: 1 }],
        });
        assert.deepEqual(await readAssignments(y), { version: 3, items: [] });
        assert.equal((await readAssignments(untouched)).version, 2);
        for (const [method, path, body] of [
          ['patch', teacherPath(x), { biography: 'Stale draft' }],
          ['patch', `${teacherPath(x)}/status`, { status: 'DRAFT' }],
          ['put', assignments(x), { subjects: initial.items }],
          ['delete', teacherPath(x), {}],
        ]) {
          const response = await explicit(method, path)
            .send({ ...body, expectedVersion: initial.version })
            .expect(409);
          assert.equal(response.body.code, 'VERSION_CONFLICT');
        }
        assert.deepEqual(await readAssignments(x), current);
        for (const teacher of [x, y, untouched]) await removeTeacher(teacher);
        await editor('delete', subjectPath(b)).expect(200);
      },
    );
    await t.test(
      'subject deletion wins over parallel teacher edits, deletes, assignment writes and snapshot reads',
      async () => {
        for (const operation of ['patch', 'delete', 'assign', 'read']) {
          const a = await createSubject();
          const b = await createSubject();
          const teacher = await createTeacher();
          const initial = await assign(teacher, [a, b]);
          await withTeacherLock(
            teacher,
            async ({ start, waitForWaiters, release }) => {
              const deletion = start(editor('delete', subjectPath(a)));
              await waitForWaiters(1);
              const request =
                operation === 'assign'
                  ? explicit('put', assignments(teacher)).send({
                      subjects: initial.items,
                      expectedVersion: initial.version,
                    })
                  : operation === 'read'
                    ? editor('get', assignments(teacher))
                    : explicit(operation, teacherPath(teacher)).send({
                        expectedVersion: initial.version,
                        ...(operation === 'patch'
                          ? { biography: 'Parallel edit' }
                          : {}),
                      });
              const competing = start(request);
              await waitForWaiters(2);
              await release();
              assert.equal((await deletion).status, 200);
              const response = await competing;
              if (operation === 'read')
                assert.deepEqual(response.body.detail, {
                  version: 3,
                  items: [{ subjectId: b.id, sortOrder: 1 }],
                });
              else {
                assert.equal(response.status, 409, operation);
                assert.equal(response.body.code, 'VERSION_CONFLICT');
              }
            },
          );
          await removeTeacher(teacher);
          await editor('delete', subjectPath(b)).expect(200);
        }
      },
    );
    await t.test(
      'parallel teacher edits survive the cascade and deleting the teacher first leaves no extra work',
      async () => {
        for (const operation of ['patch', 'delete']) {
          const a = await createSubject();
          const teacher = await createTeacher();
          const initial = await assign(teacher, [a]);
          await withTeacherLock(
            teacher,
            async ({ start, waitForWaiters, release }) => {
              const competing = start(
                explicit(operation, teacherPath(teacher)).send({
                  expectedVersion: initial.version,
                  ...(operation === 'patch'
                    ? { biography: 'Winning edit' }
                    : {}),
                }),
              );
              await waitForWaiters(1);
              const deletion = start(editor('delete', subjectPath(a)));
              await waitForWaiters(2);
              await release();
              assert.equal((await competing).status, 200);
              assert.equal((await deletion).status, 200);
            },
          );
          if (operation === 'patch') {
            const actual = (
              await editor('get', teacherPath(teacher)).expect(200)
            ).body.detail;
            assert.equal(actual.biography, 'Winning edit');
            assert.equal(actual.version, 4);
            assert.deepEqual((await readAssignments(teacher)).items, []);
            await removeTeacher(teacher);
          } else await editor('get', teacherPath(teacher)).expect(404);
        }
      },
    );
    await t.test(
      'parallel assignment removal is not counted twice; newly added links cannot escape the cascade',
      async () => {
        for (const operation of ['remove', 'add', 'retain']) {
          const a = await createSubject();
          const b = await createSubject();
          const teacher = await createTeacher();
          const initial = await assign(
            teacher,
            operation === 'add' ? [b] : [a, b],
          );
          const desired = operation === 'remove' ? [b] : [a, b];
          await withTeacherLock(
            teacher,
            async ({ start, waitForWaiters, release }) => {
              const replacement = start(
                explicit('put', assignments(teacher)).send({
                  expectedVersion: initial.version,
                  subjects: desired.map((subject, sortOrder) => ({
                    subjectId: subject.id,
                    sortOrder,
                  })),
                }),
              );
              await waitForWaiters(1);
              const deletion = start(editor('delete', subjectPath(a)));
              await waitForWaiters(2);
              await release();
              assert.equal((await replacement).status, 200, operation);
              assert.equal((await deletion).status, 200, operation);
            },
          );
          assert.deepEqual(await readAssignments(teacher), {
            version: operation === 'remove' ? 3 : 4,
            items: [
              { subjectId: b.id, sortOrder: operation === 'remove' ? 0 : 1 },
            ],
          });
          await removeTeacher(teacher);
          await editor('delete', subjectPath(b)).expect(200);
        }
      },
    );
    await t.test(
      'parallel deletion of overlapping subjects increments each surviving teacher once per cascade',
      async () => {
        const a = await createSubject();
        const b = await createSubject();
        const teachers = [await createTeacher(), await createTeacher()];
        for (const teacher of teachers) await assign(teacher, [b, a]);
        await withTeacherLock(
          teachers[0],
          async ({ start, waitForWaiters, release }) => {
            const first = start(editor('delete', subjectPath(a)));
            const second = start(editor('delete', subjectPath(b)));
            await waitForWaiters(2);
            await release();
            assert.deepEqual(
              (await Promise.all([first, second])).map((r) => r.status),
              [200, 200],
            );
          },
        );
        for (const teacher of teachers) {
          assert.deepEqual(await readAssignments(teacher), {
            version: 4,
            items: [],
          });
          await removeTeacher(teacher);
        }
      },
    );
    await t.test(
      'public catalog allows guests, administration requires editor role',
      async () => {
        const empty = await http.get('/catalog/subjects').expect(200);
        assert.deepEqual(empty.body.detail, { items: [], hasMore: false });
        await http.get('/admin/subjects').expect(401);
        for (const role of ['TEACHER', 'STUDENT', 'BLOCKED']) {
          await http
            .get('/admin/subjects')
            .set('Cookie', `access_token=${role}`)
            .expect(403);
          await http
            .post('/admin/teachers')
            .set('Cookie', `access_token=${role}`)
            .send({})
            .expect(403);
        }
        await http
          .get('/admin/subjects')
          .set('Cookie', 'access_token=ADMIN')
          .expect(200);
        await http
          .post('/admin/subjects')
          .set('Cookie', 'access_token=MANAGER')
          .set('Origin', 'https://evil.example')
          .send({})
          .expect(403);
      },
    );
    await t.test(
      'creates drafts, normalizes slugs, rejects invalid and duplicate data',
      async () => {
        subject = (
          await editor('post', '/admin/subjects')
            .send({ name: ' History ', sortOrder: 4 })
            .expect(201)
        ).body.detail;
        assert.equal(subject.name, 'History');
        assert.equal(subject.slug, 'history');
        assert.equal(subject.status, 'DRAFT');
        await editor('post', '/admin/subjects')
          .send({ name: 'Duplicate', slug: 'HISTORY' })
          .expect(400);
        for (const payload of [
          { name: '' },
          { name: 'Name', slug: '../bad' },
          { name: 'Name', sortOrder: -1 },
          { name: 'Name', sortOrder: null },
        ])
          await editor('post', '/admin/subjects').send(payload).expect(400);
        teacher = (
          await editor('post', '/admin/teachers')
            .send({
              firstName: 'Olena',
              lastName: 'Koval',
            })
            .expect(201)
        ).body.detail;
        assert.equal('userId' in teacher, false);
        await editor('post', '/admin/teachers')
          .send({ firstName: 'Other', lastName: 'Name', slug: teacher.slug })
          .expect(400);
        await editor('patch', `/admin/teachers/${teacher.id}`)
          .send({ userId: randomUUID() })
          .expect(400);
      },
    );
    await t.test(
      'drafts are hidden and publication requires complete content',
      async () => {
        await http.get('/catalog/subjects/history').expect(404);
        await http.get('/catalog/teachers/olena-koval').expect(404);
        assert.deepEqual(
          (await http.get('/catalog/teachers').expect(200)).body.detail.items,
          [],
        );
        await editor('patch', `/admin/teachers/${teacher.id}/status`)
          .send({ status: 'PUBLISHED' })
          .expect(400);
        await editor('patch', `/admin/subjects/${subject.id}`)
          .send({ description: 'Removed field' })
          .expect(400);
        await editor('patch', `/admin/subjects/${subject.id}/status`)
          .send({ status: 'PUBLISHED' })
          .expect(200);
        await editor('patch', `/admin/teachers/${teacher.id}`)
          .send({
            photoId: photo.id,
            shortDescription: 'History teacher',
            biography: 'Teaching experience and approach',
          })
          .expect(200);
        await editor('patch', `/admin/teachers/${teacher.id}/status`)
          .send({ status: 'PUBLISHED' })
          .expect(200);
        await http.get('/catalog/subjects/history').expect(200);
        await http.get('/catalog/teachers/olena-koval').expect(200);
        await editor('patch', `/admin/teachers/${teacher.id}`)
          .send({ biography: null })
          .expect(400);
        await editor('patch', `/admin/teachers/${teacher.id}`)
          .send({ firstName: null })
          .expect(400);
        await editor('patch', `/admin/subjects/${subject.id}`)
          .send({})
          .expect(400);
        await editor('patch', `/admin/subjects/${subject.id}/status`)
          .send({ status: 'UNKNOWN' })
          .expect(400);
      },
    );
    await t.test(
      'many-to-many replacement is atomic, rejects duplicates and filters drafts',
      async () => {
        second = (
          await editor('post', '/admin/subjects')
            .send({
              name: 'Literature',
              sortOrder: 0,
            })
            .expect(201)
        ).body.detail;
        const assignments = [
          { subjectId: subject.id, sortOrder: 1 },
          { subjectId: second.id, sortOrder: 0 },
        ];
        await editor('put', `/admin/teachers/${teacher.id}/subjects`)
          .send({ subjects: assignments })
          .expect(200);
        const list = (
          await editor('get', `/admin/teachers/${teacher.id}/subjects`).expect(
            200,
          )
        ).body.detail.items;
        assert.equal(list.length, 2);
        assert.equal(list[0].subjectId, second.id);
        const publicTeachers = (
          await http.get('/catalog/subjects/history/teachers').expect(200)
        ).body.detail.items;
        assert.equal(publicTeachers[0].id, teacher.id);
        await http.get('/catalog/subjects/literature/teachers').expect(404);
        await editor('put', `/admin/teachers/${teacher.id}/subjects`)
          .send({
            subjects: [
              { subjectId: subject.id, sortOrder: 0 },
              { subjectId: randomUUID(), sortOrder: 0 },
            ],
          })
          .expect(404);
        assert.deepEqual(
          (
            await editor(
              'get',
              `/admin/teachers/${teacher.id}/subjects`,
            ).expect(200)
          ).body.detail.items,
          list,
        );
        await editor('put', `/admin/teachers/${teacher.id}/subjects`)
          .send({ subjects: [assignments[0], assignments[0]] })
          .expect(400);
        await editor('put', `/admin/teachers/${teacher.id}/subjects`)
          .send({ subjects: [{ subjectId: subject.id, sortOrder: -1 }] })
          .expect(400);
        await editor('patch', `/admin/teachers/${teacher.id}/status`)
          .send({ status: 'DRAFT' })
          .expect(200);
        assert.equal(
          (await http.get('/catalog/subjects/history/teachers').expect(200))
            .body.detail.items.length,
          0,
        );
        await editor('patch', `/admin/teachers/${teacher.id}/status`)
          .send({ status: 'PUBLISHED' })
          .expect(200);
      },
    );
    await t.test(
      'media is private until the owning teacher is published and PDF cannot be a photo',
      async () => {
        await http.get(`/admin/media/${photo.id}`).expect(401);
        await http.get(`/admin/media/${photo.id}/content`).expect(401);
        await http
          .get(`/admin/media/${photo.id}/content`)
          .set('Cookie', 'access_token=STUDENT')
          .expect(403);
        const privatePhoto = await editor(
          'get',
          `/admin/media/${photo.id}/content`,
        ).expect(200);
        assert.match(privatePhoto.headers['content-type'], /image\/webp/);
        assert.equal(
          privatePhoto.headers['cache-control'],
          'private, no-store',
        );
        assert.equal(privatePhoto.body.subarray(8, 12).toString(), 'WEBP');
        assert.equal(privatePhoto.headers['x-content-type-options'], 'nosniff');
        assert.equal(
          (await editor('get', `/admin/media/${photo.id}`).expect(200)).body
            .detail.objectKey,
          undefined,
        );
        await http.get('/catalog/teachers/olena-koval/photo').expect(200);
        await editor('patch', `/admin/teachers/${teacher.id}/status`)
          .send({ status: 'DRAFT' })
          .expect(200);
        await http.get('/catalog/teachers/olena-koval/photo').expect(404);
        await editor('patch', `/admin/teachers/${teacher.id}/status`)
          .send({ status: 'PUBLISHED' })
          .expect(200);
        await editor('delete', `/admin/media/${photo.id}`).expect(409);
        const pdfDoc = await PDFDocument.create();
        pdfDoc.addPage();
        const pdf = Buffer.from(await pdfDoc.save());
        const uploaded = (
          await editor('post', '/admin/media/pdfs')
            .attach('file', pdf, {
              filename: 'document.pdf',
              contentType: 'application/octet-stream',
            })
            .expect(201)
        ).body.detail;
        assert.equal(uploaded.kind, 'PDF');
        assert.equal(uploaded.pageCount, 1);
        const document = await editor(
          'get',
          `/admin/media/${uploaded.id}/content`,
        ).expect(200);
        assert.match(document.headers['content-disposition'], /^attachment;/);
        assert.equal(document.body.subarray(0, 5).toString(), '%PDF-');
        await editor('patch', `/admin/teachers/${teacher.id}`)
          .send({ photoId: uploaded.id })
          .expect(400);
        assert.equal(
          (await editor('get', `/admin/teachers/${teacher.id}`).expect(200))
            .body.detail.photoId,
          photo.id,
        );
      },
    );
    await t.test(
      'upload validates actual bytes, request limits and authorization',
      async () => {
        await http
          .post('/admin/media/images')
          .attach('file', image, 'photo.png')
          .expect(401);
        await http
          .post('/admin/media/images')
          .set('Cookie', 'access_token=STUDENT')
          .attach('file', image, 'photo.png')
          .expect(403);
        await http
          .post('/admin/media/images')
          .set('Cookie', 'access_token=MANAGER')
          .set('Origin', 'https://evil.example')
          .attach('file', image, 'photo.png')
          .expect(403);
        await editor('post', '/admin/media/images').expect(400);
        await editor('post', '/admin/media/images')
          .attach('file', Buffer.from('<svg/>'), {
            filename: 'photo.png',
            contentType: 'image/png',
          })
          .expect(400);
        await editor('post', '/admin/media/pdfs')
          .attach('file', image, 'fake.pdf')
          .expect(400);
        await editor('post', '/admin/media/images')
          .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')
          .expect(413);
        await editor('post', '/admin/media/pdfs')
          .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'large.pdf')
          .expect(413);
        await editor('post', '/admin/media/images')
          .attach('file', image, 'one.png')
          .attach('file', image, 'two.png')
          .expect(400);
        const uploaded = (
          await editor('post', '/admin/media/images')
            .attach('file', image, {
              filename: '../../photo.bin',
              contentType: 'application/octet-stream',
            })
            .expect(201)
        ).body.detail;
        assert.equal(uploaded.mimeType, 'image/webp');
        assert.equal(uploaded.width, 20);
        await editor('delete', `/admin/media/${uploaded.id}`).expect(200);
        await editor('get', `/admin/media/${uploaded.id}/content`).expect(404);
      },
    );
    await t.test(
      'cleanup keeps attached images and retries durable object deletions',
      async () => {
        const abandoned = await mediaService.upload(image, 'IMAGE');
        await pool.query(
          "UPDATE media SET expires_at = now() - interval '1 hour' WHERE id IN ($1, $2)",
          [abandoned.id, photo.id],
        );
        failDeletion = true;
        await cleanup.run();
        await editor('get', `/admin/media/${abandoned.id}`).expect(404);
        await editor('get', `/admin/media/${photo.id}`).expect(200);
        const pending = (await pool.query('SELECT * FROM media_deletions'))
          .rows;
        assert(pending.length > 0);
        failDeletion = false;
        await pool.query(
          "UPDATE media_deletions SET next_attempt_at = now() - interval '1 second'",
        );
        await cleanup.run();
        assert.equal(
          (await pool.query('SELECT * FROM media_deletions')).rows.length,
          0,
        );
        for (const row of pending)
          assert.equal(objects.has(row.object_key), false);
        failStorage = true;
        await assert.rejects(
          mediaService.upload(image, 'IMAGE'),
          (error) => error.getStatus() === 503,
        );
        failStorage = false;
        const incomplete = (
          await pool.query("SELECT id FROM media WHERE state = 'UPLOADING'")
        ).rows;
        assert.equal(incomplete.length, 1);
        await editor('get', `/admin/media/${incomplete[0].id}`).expect(404);
        await pool.query(
          "UPDATE media SET expires_at = now() - interval '1 hour' WHERE state = 'UPLOADING'",
        );
        await cleanup.run();
        assert.equal(
          (await pool.query("SELECT id FROM media WHERE state = 'UPLOADING'"))
            .rows.length,
          0,
        );
      },
    );
    await t.test(
      'photo replacement preserves shared references and failed teacher writes roll back media state',
      async () => {
        const replacement = await mediaService.upload(image, 'IMAGE');
        await editor('post', '/admin/teachers')
          .send({
            firstName: 'Duplicate',
            lastName: 'Teacher',
            photoId: randomUUID(),
          })
          .expect(404);
        assert(
          (
            await pool.query('SELECT expires_at FROM media WHERE id = $1', [
              replacement.id,
            ])
          ).rows[0].expires_at,
        );
        const shared = (
          await editor('post', '/admin/teachers')
            .send({
              firstName: 'Shared',
              lastName: 'Teacher',
              photoId: photo.id,
            })
            .expect(201)
        ).body.detail;
        await editor('patch', `/admin/teachers/${teacher.id}`)
          .send({ photoId: replacement.id })
          .expect(200);
        await pool.query(
          "UPDATE media SET expires_at = now() - interval '1 hour' WHERE id = $1",
          [photo.id],
        );
        await cleanup.run();
        await editor('get', `/admin/media/${photo.id}`).expect(200);
        await editor('delete', `/admin/teachers/${shared.id}`).expect(200);
        await pool.query(
          "UPDATE media SET expires_at = now() - interval '1 hour' WHERE id = $1",
          [photo.id],
        );
        await cleanup.run();
        await editor('get', `/admin/media/${photo.id}`).expect(404);
        await editor('get', `/admin/media/${replacement.id}`).expect(200);
      },
    );
    await t.test(
      'automatic slugs are unique, immutable and support Ukrainian names',
      async () => {
        const responses = await Promise.all(
          Array.from({ length: 3 }, () =>
            editor('post', '/admin/subjects')
              .send({ name: 'Історія України' })
              .expect(201),
          ),
        );
        const rows = responses.map((response) => response.body.detail);
        assert.equal(new Set(rows.map((row) => row.slug)).size, 3);
        assert(rows.some((row) => row.slug === 'istoriya-ukrayiny'));
        for (const row of rows) {
          assert.equal('description' in row, false);
          const updated = await editor('patch', `/admin/subjects/${row.id}`)
            .send({ name: 'Нова назва' })
            .expect(200);
          assert.equal(updated.body.detail.slug, row.slug);
          await editor('delete', `/admin/subjects/${row.id}`).expect(200);
        }
        const twins = await Promise.all(
          Array.from({ length: 2 }, () =>
            editor('post', '/admin/teachers')
              .send({ firstName: 'Олена', lastName: 'Коваль' })
              .expect(201),
          ),
        );
        assert.notEqual(twins[0].body.detail.slug, twins[1].body.detail.slug);
        for (const response of twins) {
          const row = response.body.detail;
          const updated = await editor('patch', `/admin/teachers/${row.id}`)
            .send({ firstName: 'Ірина' })
            .expect(200);
          assert.equal(updated.body.detail.slug, row.slug);
          await editor('delete', `/admin/teachers/${row.id}`).expect(200);
        }
      },
    );
    await t.test(
      'pagination is bounded and subject ordering is stable',
      async () => {
        const first = (
          await editor('get', '/admin/subjects?limit=1').expect(200)
        ).body.detail;
        assert.equal(first.items[0].id, second.id);
        assert.equal(first.hasMore, true);
        const next = (
          await editor('get', '/admin/subjects?limit=1&offset=1').expect(200)
        ).body.detail;
        assert.equal(next.items[0].id, subject.id);
        assert.equal(next.hasMore, false);
        for (const query of ['limit=0', 'limit=51', 'offset=-1', 'offset=0.5'])
          await http.get(`/catalog/teachers?${query}`).expect(400);
        await editor('get', '/admin/teachers/invalid-uuid').expect(400);
        await editor('get', `/admin/teachers/${randomUUID()}`).expect(404);
      },
    );
    await t.test(
      'concurrent edits cannot leave incomplete published content',
      async () => {
        await editor('patch', `/admin/teachers/${teacher.id}/status`)
          .send({ status: 'DRAFT' })
          .expect(200);
        const results = await Promise.all([
          editor('patch', `/admin/teachers/${teacher.id}/status`).send({
            status: 'PUBLISHED',
          }),
          editor('patch', `/admin/teachers/${teacher.id}`).send({
            biography: null,
          }),
        ]);
        assert.equal(
          results.filter((response) => response.status === 200).length,
          1,
        );
        assert.equal(
          results.filter((response) => response.status === 409).length,
          1,
        );
        const actual = (
          await editor('get', `/admin/teachers/${teacher.id}`).expect(200)
        ).body.detail;
        assert(actual.status !== 'PUBLISHED' || actual.biography);
      },
    );
    await t.test(
      'deleting a subject only removes its assignments; deleting a teacher cascades links',
      async () => {
        await editor('delete', `/admin/subjects/${subject.id}`).expect(200);
        await editor('get', `/admin/teachers/${teacher.id}`).expect(200);
        assert.equal(
          (
            await editor(
              'get',
              `/admin/teachers/${teacher.id}/subjects`,
            ).expect(200)
          ).body.detail.items.length,
          1,
        );
        await editor('delete', `/admin/teachers/${teacher.id}`).expect(200);
        const { rows } = await pool.query('SELECT * FROM teacher_subjects');
        assert.equal(rows.length, 0);
        await editor('delete', `/admin/teachers/${teacher.id}`).expect(404);
      },
    );
    await t.test('Swagger describes protected writes and public reads', () => {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      assert(doc.paths['/admin/subjects'].post.requestBody);
      for (const resource of ['subjects', 'teachers']) {
        const endpoint = doc.paths[`/admin/${resource}/{id}`].delete;
        assert(endpoint.requestBody);
        assert(endpoint.responses['409']);
      }
      assert(doc.paths['/admin/teachers/{id}/subjects'].put.requestBody);
      assert(doc.paths['/admin/teachers'].get.security);
      assert.equal(doc.paths['/catalog/subjects'].get.security, undefined);
      assert(doc.components.schemas.TeacherResponseDto.properties.biography);
    });
  } finally {
    if (app) await app.close();
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
