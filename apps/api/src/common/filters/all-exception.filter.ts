import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiResponse } from '@project/contracts';
import type { Response } from 'express';

import { isDatabaseTimeout } from '../helpers/database-timeout';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();

    if (isDatabaseTimeout(exception)) {
      this.logger.warn({ event: 'database.operation_timeout' });
      response.setHeader('Retry-After', '1');
      response
        .status(503)
        .json({
          status_code: 503,
          result: 'error',
          code: 'DATABASE_TIMEOUT',
          detail: 'Database operation timed out. Please retry.',
        });
      return;
    }
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (statusCode >= 500) {
      this.logger.error({
        event: 'http.unhandled_error',
        statusCode,
        err: exception,
      });
    }

    const detail =
      exception instanceof HttpException
        ? this.getHttpExceptionDetail(exception)
        : 'Internal server error';

    const errorBody =
      exception instanceof HttpException ? exception.getResponse() : null;
    const code =
      typeof errorBody === 'object' &&
      errorBody !== null &&
      'code' in errorBody &&
      typeof errorBody.code === 'string'
        ? errorBody.code
        : undefined;
    const responseBody: ApiResponse<string | string[]> = {
      ...(code ? { code } : {}),
      status_code: statusCode,
      detail: detail,
      result: 'error',
    };

    response.status(statusCode).json(responseBody);
  }

  private getHttpExceptionDetail(exception: HttpException): string | string[] {
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
    ) {
      const message = exceptionResponse.message;

      if (typeof message === 'string') {
        return message;
      }

      if (
        Array.isArray(message) &&
        message.every((item) => typeof item === 'string')
      ) {
        return message;
      }
    }

    return exception.message;
  }
}
