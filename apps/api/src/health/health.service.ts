import { Injectable } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { DatabaseService } from '../database/database.service';
import { RedisThrottlerStorage } from '../infrastructure/rate-limit/redis-throttler.storage';
import type {
  DependencyStatus,
  ReadinessResponseDto,
} from './dto/health-response.dto';

@Injectable()
export class HealthService {
  private inFlight?: Promise<ReadinessResponseDto>;

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisThrottlerStorage,
    private readonly environment: EnvironmentService,
  ) {}

  readiness(): Promise<ReadinessResponseDto> {
    // Concurrent load-balancer probes share work, but completed results are not cached.
    this.inFlight ??= this.checkDependencies().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async checkDependencies(): Promise<ReadinessResponseDto> {
    const [postgresql, redis] = await Promise.all([
      this.check(() =>
        this.database.checkHealth(this.environment.healthCheckTimeoutMs),
      ),
      this.check(() => this.redis.checkHealth()),
    ]);
    return {
      status: postgresql === 'up' && redis === 'up' ? 'ready' : 'not_ready',
      checks: { postgresql, redis },
    };
  }

  private async check(probe: () => Promise<void>): Promise<DependencyStatus> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve()
          .then(probe)
          .then<DependencyStatus, DependencyStatus>(
            () => 'up',
            () => 'down',
          ),
        new Promise<DependencyStatus>((resolve) => {
          timer = setTimeout(
            () => resolve('down'),
            this.environment.healthCheckTimeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
