const assert = require('node:assert/strict');
const { IncomingMessage, ServerResponse } = require('node:http');
const { Readable } = require('node:stream');
const { test } = require('node:test');
require('reflect-metadata');
const {
  Body,
  Controller,
  Get,
  Post,
  Req,
  StreamableFile,
} = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const request = require('supertest');

const { EnvironmentService } = require('../dist/config/environment.service');
const { createHttpAdapter } = require('../dist/config/http-adapter');
const { configureHttpApp } = require('../dist/config/http.config');
const {
  LifecycleService,
} = require('../dist/infrastructure/lifecycle/lifecycle.service');

const contents = Buffer.from([0, 1, 127, 128, 255]);
class TransportController {
  parameter(req) {
    return { path: req.path };
  }
  staticRoute() {
    return { route: 'static' };
  }
  echo(body) {
    return body;
  }
  file() {
    return new StreamableFile(Readable.from(contents), {
      type: 'application/octet-stream',
      length: contents.length,
      disposition: 'attachment; filename="sample.bin"',
    });
  }
}
Controller('_transport')(TransportController);
for (const [name, decorator] of [
  ['parameter', Get(':slug')],
  ['staticRoute', Get('static')],
  ['echo', Post('echo')],
  ['file', Get('file')],
])
  decorator(
    TransportController.prototype,
    name,
    Object.getOwnPropertyDescriptor(TransportController.prototype, name),
  );
Req()(TransportController.prototype, 'parameter', 0);
Body()(TransportController.prototype, 'echo', 0);

test('native HTTP transport preserves the application HTTP contract', async (t) => {
  const module = await Test.createTestingModule({
    controllers: [TransportController],
    providers: [
      LifecycleService,
      {
        provide: EnvironmentService,
        useValue: {
          frontendOrigin: 'http://localhost:3001',
          isProduction: false,
          shutdownTimeoutMs: 2000,
        },
      },
    ],
  }).compile();
  const app = module.createNestApplication(createHttpAdapter(), {
    logger: false,
  });
  t.after(() => app.close());
  assert.equal(app.getHttpAdapter().getType(), 'node');
  app.use((req, res, next) => {
    assert(req instanceof IncomingMessage);
    assert(res instanceof ServerResponse);
    next();
  });
  configureHttpApp(app);
  await app.listen(0, '127.0.0.1');
  const http = request(app.getHttpServer());

  await t.test(
    'static routes take priority, paths are case-sensitive and catalog-sized parameters work',
    async () => {
      const result = await http.get('/_transport/static').expect(200);
      assert.deepEqual(result.body.detail, { route: 'static' });
      await http.get('/_TRANSPORT/static').expect(404);
      for (const length of [100, 150, 200]) {
        const path = `/_transport/${'a'.repeat(length)}`;
        const response = await http.get(path).expect(200);
        assert.equal(response.body.detail.path, path);
      }
      await http.get(`/_transport/${'a'.repeat(201)}`).expect(414);
    },
  );
  await t.test(
    'JSON parsing preserves envelopes and rejects malformed, oversized and prototype-poisoned bodies',
    async () => {
      const response = await http
        .post('/_transport/echo')
        .send({ text: 'Привіт' })
        .expect(201);
      assert.deepEqual(response.body, {
        status_code: 201,
        result: 'success',
        detail: { text: 'Привіт' },
      });
      for (const [body, status] of [
        ['{', 400],
        ['{"__proto__":{"polluted":true}}', 400],
        ['{"constructor":{"prototype":{"polluted":true}}}', 400],
        [JSON.stringify({ text: 'a'.repeat(110 * 1024) }), 413],
      ]) {
        const rejected = await http
          .post('/_transport/echo')
          .type('json')
          .send(body)
          .expect(status);
        assert.equal(rejected.body.status_code, status);
        assert.equal(rejected.body.result, 'error');
      }
      assert.equal({}.polluted, undefined);
    },
  );
  await t.test(
    'CORS preflight allows credentialed requests and exposes request/rate headers',
    async () => {
      const response = await http
        .options('/_transport/echo')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
      assert.equal(
        response.headers['access-control-allow-origin'],
        'http://localhost:3001',
      );
      assert.equal(
        response.headers['access-control-allow-credentials'],
        'true',
      );
      const actual = await http
        .get('/_transport/static')
        .set('Origin', 'http://localhost:3001')
        .expect(200);
      assert.match(
        actual.headers['access-control-expose-headers'],
        /X-Request-Id/,
      );
      assert.match(
        actual.headers['access-control-expose-headers'],
        /Retry-After/,
      );
    },
  );
  await t.test(
    'file responses stream exact bytes and HEAD keeps headers without a body',
    async () => {
      const response = await http.get('/_transport/file').expect(200);
      assert.deepEqual(response.body, contents);
      assert.equal(response.headers['content-length'], String(contents.length));
      assert.equal(
        response.headers['content-disposition'],
        'attachment; filename="sample.bin"',
      );
      const head = await http.head('/_transport/file').expect(200);
      assert.equal(head.headers['content-length'], String(contents.length));
      assert.equal(head.text, undefined);
    },
  );
  await t.test(
    'Swagger JSON, HTML and static assets work on the native adapter',
    async () => {
      const json = await http.get('/docs-json').expect(200);
      assert(json.body.paths['/_transport/echo']);
      const html = await http.get('/docs').expect(200);
      assert.match(html.headers['content-type'], /text\/html/);
      assert.match(html.text, /swagger-ui/);
      const css = await http.get('/docs/swagger-ui.css').expect(200);
      assert.match(css.headers['content-type'], /text\/css/);
      const js = await http.get('/docs/swagger-ui-bundle.js').expect(200);
      assert.match(js.headers['content-type'], /javascript/);
    },
  );
});
