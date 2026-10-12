import { ServiceUnavailableException } from '@nestjs/common';

import type { ReadinessResponseDto } from './dto/health-response.dto';

export class HealthUnavailableException extends ServiceUnavailableException {
  constructor(readonly detail: ReadinessResponseDto) {
    super('API dependencies are not ready');
  }
}
