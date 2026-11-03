import { Module } from '@nestjs/common';

import { EnvironmentModule } from '../../config/environment.module';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Module({
  imports: [EnvironmentModule],
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class RateLimitStorageModule {}
