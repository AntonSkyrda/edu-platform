import { Controller, Get, Header, UseFilters } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { ApiEnvelope } from '../common/decorators/api-envelope.decorator';
import { Public } from '../common/decorators/public.decorator';
import {
  LivenessResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto';
import { HealthExceptionFilter } from './health-exception.filter';
import { HealthUnavailableException } from './health-unavailable.exception';
import { HealthService } from './health.service';

@ApiTags('Health')
@SkipThrottle()
@Public()
@UseFilters(HealthExceptionFilter)
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Process liveness; does not query dependencies' })
  @ApiEnvelope(LivenessResponseDto)
  liveness(): LivenessResponseDto {
    return { status: 'ok' };
  }

  @Get(['ready', ''])
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'PostgreSQL and Redis readiness; /health is a compatibility alias',
  })
  @ApiEnvelope(ReadinessResponseDto)
  @ApiResponse({
    status: 503,
    description: 'At least one dependency is unavailable or timed out',
    schema: {
      type: 'object',
      required: ['status_code', 'detail', 'result'],
      properties: {
        status_code: { type: 'integer', example: 503 },
        detail: { $ref: getSchemaPath(ReadinessResponseDto) },
        result: { type: 'string', enum: ['error'] },
      },
    },
  })
  async readiness(): Promise<ReadinessResponseDto> {
    const result = await this.health.readiness();
    if (result.status !== 'ready') throw new HealthUnavailableException(result);
    return result;
  }
}
