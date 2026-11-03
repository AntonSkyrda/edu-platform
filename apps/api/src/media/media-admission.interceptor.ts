import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { defer, finalize, from, switchMap } from 'rxjs';

import { MediaAdmissionService } from './services/media-admission.service';

@Injectable()
export class MediaAdmissionInterceptor implements NestInterceptor {
  constructor(private readonly admission: MediaAdmissionService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    return defer(() => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      request.once('aborted', abort);
      response.once('close', abort);
      if (request.aborted || response.destroyed) abort();
      return from(this.admission.acquire(controller.signal)).pipe(
        switchMap((release) =>
          defer(() => next.handle()).pipe(finalize(release)),
        ),
        finalize(() => {
          request.off('aborted', abort);
          response.off('close', abort);
        }),
      );
    });
  }
}
