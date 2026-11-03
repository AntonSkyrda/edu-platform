import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { RateLimitStorageModule } from './rate-limit-storage.module';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [RateLimitStorageModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        // Auth has a 20/min controller override; sensitive routes use 5 or 10.
        throttlers: [{ ttl: 60000, limit: 60 }],
        ipv6SubnetPrefix: 64,
      }),
    }),
  ],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
