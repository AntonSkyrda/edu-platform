const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { Readable } = require('node:stream');
const { test } = require('node:test');

const { ThrottlerGuard } = require('@nestjs/throttler');
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
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
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
    const editor = (method, path) =>
      http[method](path)
        .set('Cookie', 'access_token=MANAGER')
        .set('Origin', 'http://localhost:3001');
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
    let subject;
    let teacher;
    let second;
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
          results.filter((response) => response.status === 400).length,
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
