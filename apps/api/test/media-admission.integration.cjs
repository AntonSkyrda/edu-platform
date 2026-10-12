const assert = require('node:assert/strict');
const { request: httpRequest } = require('node:http');
const { test } = require('node:test');
require('reflect-metadata');
const { BadRequestException } = require('@nestjs/common');
const { MulterModule } = require('@nestjs/platform-express');
const { Test } = require('@nestjs/testing');
const request = require('supertest');

const {
  AllExceptionFilter,
} = require('../dist/common/filters/all-exception.filter');
const { PermissionsGuard } = require('../dist/common/guards/permissions.guard');
const { EnvironmentService } = require('../dist/config/environment.service');
const {
  MediaAdmissionInterceptor,
} = require('../dist/media/media-admission.interceptor');
const { MediaController } = require('../dist/media/media.controller');
const {
  MediaAdmissionService,
} = require('../dist/media/services/media-admission.service');
const { MediaService } = require('../dist/media/services/media.service');
const { until } = require('./helpers/database-fixture.cjs');

test(
  'media routes share bounded admission before buffering multipart uploads',
  { timeout: 15000 },
  async (t) => {
    let release,
      fail = false;
    let gate = new Promise((resolve) => {
      release = resolve;
    });
    const calls = [];
    const module = await Test.createTestingModule({
      imports: [MulterModule.register({ limits: { fileSize: 1024 } })],
      controllers: [MediaController],
      providers: [
        MediaAdmissionService,
        MediaAdmissionInterceptor,
        {
          provide: EnvironmentService,
          useValue: {
            mediaMaxConcurrent: 1,
            mediaMaxWaiting: 1,
            mediaWaitTimeoutMs: 300,
          },
        },
        {
          provide: MediaService,
          useValue: {
            upload: async (buffer, kind) => {
              calls.push({ size: buffer.length, kind });
              await gate;
              if (fail) throw new BadRequestException('Invalid media');
              return { kind };
            },
          },
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication({ logger: false });
    app.useGlobalFilters(new AllExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const admission = app.get(MediaAdmissionService);
    const http = request(app.getHttpServer());
    const upload = (kind, bytes = 10) =>
      http
        .post(`/admin/media/${kind}`)
        .attach('file', Buffer.alloc(bytes), `test.${kind}`)
        .then((response) => response);
    try {
      await t.test(
        'PDF and image requests share capacity; queue overflow and wait timeout return 503',
        async () => {
          const image = upload('images');
          await until(() => calls.length === 1);
          const pdf = upload('pdfs');
          await until(() => admission.waiting.length === 1);
          // Larger than the Multer limit: admission must reject it before buffering.
          const overflow = await upload('images', 2048);
          assert.equal(overflow.status, 503);
          assert.equal(overflow.body.code, 'MEDIA_BUSY');
          const expired = await pdf;
          assert.equal(expired.status, 503);
          assert.equal(calls.length, 1);
          release();
          assert.equal((await image).status, 201);
          assert.equal((await upload('pdfs')).status, 201);
          assert.deepEqual(
            calls.map((row) => row.kind),
            ['IMAGE', 'PDF'],
          );
        },
      );
      await t.test(
        'validation and processor failures release their slot',
        async () => {
          assert.equal((await upload('images', 2048)).status, 413);
          fail = true;
          assert.equal((await upload('images')).status, 400);
          fail = false;
          assert.equal((await upload('pdfs')).status, 201);
        },
      );
      await t.test(
        'disconnecting a queued upload frees waiting capacity without starting its processor',
        async () => {
          gate = new Promise((resolve) => {
            release = resolve;
          });
          const before = calls.length;
          const active = upload('images');
          await until(() => calls.length === before + 1);
          const disconnected = httpRequest(
            `${await app.getUrl()}/admin/media/pdfs`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'multipart/form-data; boundary=test',
                'Transfer-Encoding': 'chunked',
              },
            },
          );
          disconnected.on('error', () => undefined);
          disconnected.write('--test\r\n');
          await until(() => admission.waiting.length === 1);
          disconnected.destroy();
          await until(() => admission.waiting.length === 0);
          const waiting = upload('pdfs');
          await until(() => admission.waiting.length === 1);
          release();
          assert.equal((await active).status, 201);
          assert.equal((await waiting).status, 201);
          assert.equal(calls.length, before + 2);
        },
      );
    } finally {
      release();
      await app.close();
    }
  },
);
