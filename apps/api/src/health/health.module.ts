import { Module } from '@nestjs/common';

import { EnvironmentModule } from '../config/environment.module';
import { DatabaseModule } from '../database/database.module';
import { RateLimitStorageModule } from '../infrastructure/rate-limit/rate-limit-storage.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [EnvironmentModule, DatabaseModule, RateLimitStorageModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
