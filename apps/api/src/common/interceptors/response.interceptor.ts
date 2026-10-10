import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { ApiResponse } from '@project/contracts';
import { map, Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T> | StreamableFile
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | StreamableFile> {
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((detail: T) =>
        detail instanceof StreamableFile
          ? detail
          : {
              status_code: response.statusCode,
              detail: detail,
              result: 'success',
            },
      ),
    );
  }
}
