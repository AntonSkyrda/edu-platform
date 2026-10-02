const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { test } = require('node:test');
const { setTimeout } = require('node:timers/promises');

require('reflect-metadata');
const {
  Controller,
  Get,
  Post,
  Module,
  Logger: NestLogger,
} = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const { Logger, PARAMS_PROVIDER_TOKEN } = require('nestjs-pino');
const request = require('supertest');

const {
  InvitationEmailProcessor,
} = require('../dist/auth/processors/invitation-email.processor');
const {
  InvitationDeliveryService,
} = require('../dist/auth/services/invitation-delivery.service');
const {
  AllExceptionFilter,
} = require('../dist/common/filters/all-exception.filter');
const { createLoggerOptions } = require('../dist/config/logger.config');
const { LoggerModule } = require('../dist/infrastructure/logger/logger.module');
const {
  loggingContext,
} = require('../dist/infrastructure/logger/logging-context');

test('Pino correlates HTTP and jobs, records 500s and omits sensitive data', async () => {
  const records = [];
  const stream = new Writable({
    write(chunk, _encoding, next) {
      records.push(
        ...chunk
          .toString()
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
      );
      next();
    },
  });
  const options = createLoggerOptions({
    logLevel: 'info',
    nodeEnvironment: 'production',
    isDevelopment: false,
  });
  const logger = new NestLogger('Probe');
  class ProbeController {
    async success() {
      logger.log({
        event: 'probe.started',
        password: 'secret-top',
        detail: { token: 'secret-nested' },
      });
      await setTimeout(10);
      logger.log({ event: 'probe.finished' });
      return { ok: true };
    }
    failure() {
      throw Object.assign(new Error('secret-error-message'), {
        code: 'ETEST',
        password: 'secret-error-property',
        cause: new Error('secret-cause'),
      });
    }
  }
  Controller('probe')(ProbeController);
  Post('success')(
    ProbeController.prototype,
    'success',
    Object.getOwnPropertyDescriptor(ProbeController.prototype, 'success'),
  );
  Get('failure')(
    ProbeController.prototype,
    'failure',
    Object.getOwnPropertyDescriptor(ProbeController.prototype, 'failure'),
  );
  class ProbeModule {}
  Module({ imports: [LoggerModule], controllers: [ProbeController] })(
    ProbeModule,
  );
  const module = await Test.createTestingModule({ imports: [ProbeModule] })
    .overrideProvider(PARAMS_PROVIDER_TOKEN)
    .useValue({ pinoHttp: [options, stream] })
    .compile();
  const app = module.createNestApplication({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new AllExceptionFilter());
  try {
    await app.init();
    const http = request(app.getHttpServer());
    const responses = await Promise.all(
      [1, 2].map(() =>
        http
          .post('/probe/success?token=secret-query')
          .set('Cookie', 'access_token=secret-cookie')
          .set('Authorization', 'Bearer secret-header')
          .set('X-Request-Id', 'secret-untrusted-id')
          .send({ password: 'secret-body' })
          .expect(201),
      ),
    );
    const ids = responses.map((response) => response.headers['x-request-id']);
    assert.notEqual(ids[0], ids[1]);
    for (const id of ids) {
      assert.match(id, /^[a-f0-9-]{36}$/);
      assert(
        records.some(
          (row) => row.requestId === id && row.event === 'probe.started',
        ),
      );
      assert(
        records.some(
          (row) => row.requestId === id && row.event === 'probe.finished',
        ),
      );
      assert(
        records.some(
          (row) =>
            row.requestId === id &&
            row.res?.statusCode === 201 &&
            typeof row.responseTime === 'number',
        ),
      );
    }
    const failure = await http.get('/probe/failure').expect(500);
    const error = records.find(
      (row) =>
        row.requestId === failure.headers['x-request-id'] &&
        row.event === 'http.unhandled_error',
    );
    assert.equal(error.level, 50);
    assert.equal(error.err.code, 'ETEST');
    assert.match(error.err.stack, /ProbeController.failure/);
    let payload;
    const delivery = new InvitationDeliveryService(
      {},
      {
        enqueue: async (_queue, _name, data) => {
          payload = data;
        },
      },
      {},
    );
    await loggingContext.run({ requestId: ids[0] }, () =>
      delivery.enqueue('invitation-test'),
    );
    assert.equal(payload.requestId, ids[0]);
    const worker = new InvitationEmailProcessor(
      {
        prepareDelivery: async () => ({
          user: { email: 'private@example.test', firstName: 'Test' },
          token: 'secret-invitation',
        }),
        recordDelivery: async () => {},
        recordDeliveryAttempt: async () => {},
      },
      {
        send: async () => {
          logger.log({ event: 'probe.smtp' });
        },
      },
      { frontendOrigin: 'http://localhost:3001', invitationTtlMs: 3600000 },
    );
    await worker.process({ id: 'job-test', name: 'invitation', data: payload });
    assert(
      records.some(
        (row) =>
          row.event === 'probe.smtp' &&
          row.requestId === ids[0] &&
          row.jobId === 'job-test',
      ),
    );
    assert.equal(loggingContext.getStore(), undefined);
    logger.error(new Error('secret-direct-error'));
    const output = JSON.stringify(records);
    assert(!output.includes('secret-'), output);
    assert(!output.includes('private@example.test'));
    assert(records.every((row) => row.service === 'edu-platform-api'));
    assert.equal(options.transport, undefined);
    assert.equal(
      createLoggerOptions({
        logLevel: 'debug',
        nodeEnvironment: 'development',
        isDevelopment: true,
      }).transport.target,
      'pino-pretty',
    );
  } finally {
    await app.close();
    stream.end();
    NestLogger.overrideLogger(false);
  }
});
