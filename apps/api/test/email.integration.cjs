const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createRequire } = require('node:module');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

require('reflect-metadata');
const databaseRequire = createRequire(
  resolve('../../packages/database/package.json'),
);
databaseRequire('dotenv').config({ path: '../../.env', quiet: true });
const { ConfigService } = require('@nestjs/config');

const { EnvironmentService } = require('../dist/config/environment.service');
const {
  validateEnvironment,
} = require('../dist/config/environment.validation');
const { EmailService } = require('../dist/infrastructure/email/email.service');
const { smtpServer } = require('./helpers/smtp-server.cjs');

function environment(port, overrides = {}) {
  return new EnvironmentService(
    new ConfigService(
      validateEnvironment({
        ...process.env,
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: port,
        SMTP_SECURE: false,
        SMTP_USER: 'local-test-user',
        SMTP_PASSWORD: 'local-test-password',
        SMTP_FROM: 'sender@example.test',
        SMTP_DNS_TIMEOUT_MS: 200,
        SMTP_CONNECTION_TIMEOUT_MS: 200,
        SMTP_GREETING_TIMEOUT_MS: 200,
        SMTP_SOCKET_TIMEOUT_MS: 300,
        ...overrides,
      }),
    ),
  );
}
const message = {
  to: 'recipient@example.test',
  subject: 'Local SMTP test',
  text: 'private-test-message-do-not-log',
};
async function until(check) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    assert(Date.now() < deadline, 'SMTP test sockets did not close');
    await delay(10);
  }
}

test('SMTP timeout settings have defaults, accept bounded integers and reject disabling values', () => {
  const config = { ...process.env };
  const defaults = {
    DNS: 5000,
    CONNECTION: 5000,
    GREETING: 5000,
    SOCKET: 10000,
  };
  for (const name of Object.keys(defaults))
    delete config[`SMTP_${name}_TIMEOUT_MS`];
  const validated = validateEnvironment(config);
  for (const [name, expected] of Object.entries(defaults)) {
    const key = `SMTP_${name}_TIMEOUT_MS`;
    assert.equal(validated[key], expected);
    for (const value of ['100', '60000'])
      assert.equal(
        validateEnvironment({ ...config, [key]: value })[key],
        Number(value),
      );
    for (const value of ['', null, 0, -1, 99, 60001, 1.5, 'invalid'])
      assert.throws(
        () => validateEnvironment({ ...config, [key]: value }),
        new RegExp(key),
      );
  }
});

test(
  'real SMTP failures are bounded, close their sockets and recover on the same service',
  { timeout: 15000 },
  async (t) => {
    const smtp = await smtpServer(t);
    const email = new EmailService(environment(smtp.port));
    const events = [];
    t.mock.method(email.logger, 'log', (event) => events.push(event));
    t.mock.method(email.logger, 'warn', (event) => events.push(event));
    assert.equal(
      smtp.connections,
      0,
      'constructing the service must not connect',
    );

    for (const mode of [
      'greeting-stall',
      'command-stall',
      'auth-stall',
      'data-stall',
    ]) {
      await t.test(`${mode} times out and the next send succeeds`, async () => {
        smtp.mode = mode;
        const accepted = smtp.accepted;
        const started = Date.now();
        await assert.rejects(
          email.send(message),
          (error) => error.code === 'ETIMEDOUT',
        );
        assert(
          Date.now() - started < 2000,
          'delivery must use configured timeouts',
        );
        await until(() => smtp.sockets.size === 0);
        assert.equal(smtp.accepted, accepted);
        smtp.mode = 'ready';
        await email.send(message);
        await until(() => smtp.sockets.size === 0);
        assert.equal(smtp.accepted, accepted + 1);
      });
    }
    await t.test(
      'authentication rejection propagates and does not poison subsequent delivery',
      async () => {
        smtp.mode = 'auth-reject';
        await assert.rejects(
          email.send(message),
          (error) => error.code === 'EAUTH',
        );
        await assert.rejects(
          email.send(message),
          (error) => error.code === 'EAUTH',
        );
        smtp.mode = 'ready';
        await email.send(message);
        await until(() => smtp.sockets.size === 0);
      },
    );
    assert.deepEqual(
      events,
      Array.from({ length: 5 }, () => [
        { event: 'email.transport_unavailable' },
        { event: 'email.transport_ready' },
      ]).flat(),
      'log only state transitions without raw SMTP diagnostics or messages',
    );
  },
);

test(
  'connection timeout closes a stalled TLS handshake',
  { timeout: 5000 },
  async (t) => {
    const smtp = await smtpServer(t, 'greeting-stall');
    const email = new EmailService(
      environment(smtp.port, { SMTP_SECURE: true }),
    );
    t.mock.method(email.logger, 'warn', () => undefined);
    const started = Date.now();
    await assert.rejects(
      email.send(message),
      (error) => error.code === 'ETIMEDOUT',
    );
    assert(Date.now() - started < 2000);
    await until(() => smtp.sockets.size === 0);
  },
);

test(
  'refused TCP connection rejects promptly and the same transport reconnects after recovery',
  { timeout: 5000 },
  async (t) => {
    // Reserve then release a loopback port to exercise a real connection refusal.
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise((res) => reservation.close(res));
    const email = new EmailService(environment(port));
    t.mock.method(email.logger, 'warn', () => undefined);
    const started = Date.now();
    await assert.rejects(email.send(message), (error) =>
      ['ESOCKET', 'ECONNECTION'].includes(error.code),
    );
    assert(Date.now() - started < 2000);
    const smtp = await smtpServer(t, 'ready', port);
    t.mock.method(email.logger, 'log', () => undefined);
    await email.send(message);
    assert.equal(smtp.accepted, 1);
    await until(() => smtp.sockets.size === 0);
  },
);
