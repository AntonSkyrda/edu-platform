import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Options } from 'pino-http';

import { loggingContext } from '../infrastructure/logger/logging-context';
import type { EnvironmentService } from './environment.service';

function serializeError(error: unknown) {
  if (typeof error !== 'object' || error === null)
    return { type: 'UnknownError' };
  const name =
    'name' in error &&
    typeof error.name === 'string' &&
    /^[A-Za-z]+$/.test(error.name)
      ? error.name
      : 'Error';
  const code =
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z0-9_]{1,40}$/.test(error.code)
      ? error.code
      : undefined;
  const stack =
    'stack' in error && typeof error.stack === 'string'
      ? error.stack
          .split('\n')
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 20)
          .join('\n')
      : undefined;
  return { type: name, code, stack };
}

export function createLoggerOptions(environment: EnvironmentService): Options {
  return {
    level: environment.logLevel,
    base: {
      service: 'edu-platform-api',
      environment: environment.nodeEnvironment,
    },
    ...(environment.isDevelopment
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, singleLine: true },
          },
        }
      : {}),
    hooks: {
      logMethod(args, method) {
        const first = args[0];
        if (first instanceof Error) {
          return method.call(this, { err: first }, 'Application error');
        }
        if (typeof first === 'object' && first !== null && 'err' in first) {
          return method.call(this, first, 'Application error');
        }
        return method.apply(this, args);
      },
    },
    mixin: () => ({ ...loggingContext.getStore() }),
    genReqId(request, response) {
      const id = typeof request.id === 'string' ? request.id : randomUUID();
      response.setHeader('X-Request-Id', id);
      return id;
    },
    customProps: (request) => ({ requestId: request.id }),
    customLogLevel: (_request, response, error) =>
      error || response.statusCode >= 500
        ? 'error'
        : response.statusCode >= 400
          ? 'warn'
          : 'info',
    customSuccessMessage: () => 'HTTP request completed',
    customErrorMessage: () => 'HTTP request failed',
    wrapSerializers: false,
    serializers: {
      req: (request: IncomingMessage) => ({
        id: request.id,
        method: request.method,
        path: request.url?.split('?')[0],
      }),
      res: (response: ServerResponse) => ({ statusCode: response.statusCode }),
      err: serializeError,
    },
    redact: {
      paths: [
        'password',
        'passwordHash',
        'token',
        'accessToken',
        'refreshToken',
        'authorization',
        'cookie',
        'headers',
        'body',
        'req.headers',
        'req.body',
        'res.headers',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
      ],
      remove: true,
    },
  };
}
