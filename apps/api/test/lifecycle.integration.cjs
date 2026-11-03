const assert = require('node:assert/strict');
const { request } = require('node:http');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
require('reflect-metadata');
const { Controller, Get, UseGuards } = require('@nestjs/common');
const { Test } = require('@nestjs/testing');

const { EnvironmentService } = require('../dist/config/environment.service');
const {
  LifecycleService,
} = require('../dist/infrastructure/lifecycle/lifecycle.service');
const {
  RequestLifecycleInterceptor,
} = require('../dist/infrastructure/lifecycle/request-lifecycle.interceptor');
const { trackGuard } = require('../dist/infrastructure/lifecycle/track-guard');
const { until } = require('./helpers/database-fixture.cjs');

for (const phase of ['handler', 'guard']) {
  test(
    `shutdown waits for a disconnected caller's unfinished ${phase}`,
    { timeout: 5000 },
    async () => {
      let started = false,
        completed = false,
        handlerCalled = false,
        release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const operation = async () => {
        started = true;
        await gate;
        completed = true;
        return true;
      };
      class Guard {
        canActivate(context) {
          return trackGuard(context, operation);
        }
      }
      class WorkController {
        async work() {
          handlerCalled = true;
          if (phase === 'handler') await operation();
          return 'done';
        }
      }
      Controller()(WorkController);
      Get('work')(
        WorkController.prototype,
        'work',
        Object.getOwnPropertyDescriptor(WorkController.prototype, 'work'),
      );
      if (phase === 'guard') UseGuards(Guard)(WorkController);
      const module = await Test.createTestingModule({
        controllers: [WorkController],
        providers: [
          Guard,
          LifecycleService,
          {
            provide: EnvironmentService,
            useValue: { shutdownTimeoutMs: 2000 },
          },
        ],
      }).compile();
      const app = module.createNestApplication({ logger: false });
      const lifecycle = app.get(LifecycleService);
      app.use(lifecycle.middleware);
      app.useGlobalInterceptors(new RequestLifecycleInterceptor());
      await app.listen(0, '127.0.0.1');
      let closed;
      const caller = request(`${await app.getUrl()}/work`);
      caller.on('error', () => undefined);
      caller.end();
      try {
        await until(() => started);
        caller.destroy();
        await delay(30);
        let done = false;
        closed = app.close().then(() => {
          done = true;
        });
        await delay(30);
        assert.equal(
          done,
          false,
          'Must not close dependencies while request work is unfinished',
        );
        assert.equal(lifecycle.isDraining, true);
        release();
        await closed;
        assert.equal(completed, true);
        assert.equal(handlerCalled, phase === 'handler');
      } finally {
        release();
        caller.destroy();
        await (closed ?? app.close());
      }
    },
  );
}

test('drain deadline rejects without pretending that outstanding work completed', async () => {
  const lifecycle = new LifecycleService({ shutdownTimeoutMs: 50 });
  lifecycle.register('stalled-worker', () => new Promise(() => undefined));
  const started = Date.now();
  await assert.rejects(lifecycle.drain(), /deadline exceeded/);
  assert(Date.now() - started < 1000);
  assert.equal(lifecycle.isDraining, true);
});
