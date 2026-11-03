import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';
import type { NodeResponse as Response } from '@nestjs/platform-node';
import type { ApiResponse } from '@project/contracts';

import type { ReadinessResponseDto } from './dto/health-response.dto';
import { HealthUnavailableException } from './health-unavailable.exception';

@Catch(HealthUnavailableException)
export class HealthExceptionFilter implements ExceptionFilter<HealthUnavailableException> {
  catch(exception: HealthUnavailableException, host: ArgumentsHost): void {
    const body: ApiResponse<ReadinessResponseDto> = {
      status_code: 503,
      detail: exception.detail,
      result: 'error',
    };
    host.switchToHttp().getResponse<Response>().status(503).json(body);
  }
}
