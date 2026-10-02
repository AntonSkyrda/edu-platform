import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { loggingContext } from './logging-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestId =
      typeof request.id === 'string' ? request.id : randomUUID();
    request.id = requestId;
    response.setHeader('X-Request-Id', requestId);
    loggingContext.run({ requestId }, next);
  }
}
