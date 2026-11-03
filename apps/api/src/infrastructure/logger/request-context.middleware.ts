import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type {
  NodeRequest as Request,
  NodeResponse as Response,
} from '@nestjs/platform-node';

import { loggingContext } from './logging-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: () => void): void {
    const requestId =
      typeof request.id === 'string' ? request.id : randomUUID();
    request.id = requestId;
    response.setHeader('X-Request-Id', requestId);
    loggingContext.run({ requestId }, next);
  }
}
