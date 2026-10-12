import { createHash, randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

import { EnvironmentService } from '../../config/environment.service';
import { RATE_LIMIT_SCRIPT } from './rate-limit.script';

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown, OnModuleInit
{
  private readonly redis: Redis;
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private unavailable = false;
  private healthCheck?: Promise<void>;
  private connectionVersion = 0;
  private resettingConnection = false;

  constructor(private readonly environment: EnvironmentService) {
    this.redis = new Redis({
      lazyConnect: true,
      host: environment.redisHost,
      port: environment.redisPort,
      connectTimeout: environment.rateLimitRedisTimeoutMs,
      commandTimeout: environment.rateLimitRedisTimeoutMs,
      disconnectTimeout: environment.rateLimitRedisTimeoutMs,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      autoResendUnfulfilledCommands: false,
      retryStrategy: (attempt) => Math.min(attempt * 100, 1000),
    });
    this.redis.on('error', () => {
      if (!this.unavailable) {
        this.logger.warn(
          'Rate limit Redis unavailable; limited routes return 503',
        );
        this.unavailable = true;
      }
    });
    this.redis.on('ready', () => {
      this.connectionVersion++;
      this.resettingConnection = false;
      if (this.unavailable)
        this.logger.log('Rate limit Redis connection restored');
      this.unavailable = false;
    });
  }

  checkHealth(): Promise<void> {
    // Readiness exercises the actual limiter connection without changing buckets.
    // Keep one pending PING even if the HTTP health deadline expires first.
    this.healthCheck ??= this.execute(() => this.redis.ping())
      .then((reply) => {
        if (reply !== 'PONG')
          throw new Error('Unexpected Redis health response');
      })
      .finally(() => {
        this.healthCheck = undefined;
      });
    return this.healthCheck;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    // Keep both Lua keys in one Redis hash slot. Never store raw client IPs.
    const bucket = createHash('sha256')
      .update(`${throttlerName}\0${key}`)
      .digest('hex');
    const base = `${this.environment.rateLimitRedisPrefix}:{${bucket}}`;
    try {
      const result = (await this.execute(() =>
        this.redis.eval(
          RATE_LIMIT_SCRIPT,
          2,
          `${base}:hits`,
          `${base}:blocked`,
          ttl,
          limit,
          blockDuration,
          randomUUID(),
        ),
      )) as [number, number, number, number];
      return {
        totalHits: result[0],
        timeToExpire: result[1],
        isBlocked: result[2] === 1,
        timeToBlockExpire: result[3],
      };
    } catch {
      // No local fallback: it would multiply the allowed rate by replica count.
      throw new ServiceUnavailableException(
        'Request rate limiting is temporarily unavailable',
      );
    }
  }

  private async execute<T>(command: () => Promise<T>): Promise<T> {
    if (this.resettingConnection) throw new Error('Redis reconnecting');
    const version = this.connectionVersion;
    try {
      return await command();
    } catch (error) {
      // ioredis's socketTimeout timer can outlive a closed socket and destroy a
      // replacement connection. Reset on the command timeout instead, once per
      // connection; a late failure must never disconnect a newer healthy socket.
      if (
        error instanceof Error &&
        error.message === 'Command timed out' &&
        version === this.connectionVersion &&
        this.redis.status === 'ready' &&
        !this.resettingConnection
      ) {
        this.resettingConnection = true;
        this.redis.disconnect(true);
      }
      throw error;
    }
  }

  onModuleInit(): void {
    if (this.redis.status === 'wait') {
      // Startup remains possible during an outage; requests fail closed until ready.
      void this.redis.connect().catch(() => undefined);
    }
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}
