import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { finalize } from 'rxjs';

@Injectable()
export class RequestLifecycleInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse<Response>();
    response.locals.handlerStarted = true;
    return next.handle().pipe(
      finalize(() => {
        response.locals.handlerCompleted = true;
        // Streams remain active until response finish/close; ordinary handlers also
        // release their slot when a disconnected caller cannot receive a response.
        if (response.destroyed) response.locals.finishRequest?.();
      }),
    );
  }
}
