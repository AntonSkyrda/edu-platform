import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabaseUrl } from '@project/database';

import { NodeEnvironment } from './environment.types';

@Injectable()
export class EnvironmentService {
  constructor(private readonly configService: ConfigService) {}

  get AppPort(): number {
    return this.configService.getOrThrow<number>('APP_PORT');
  }

  get postgresUser(): string {
    return this.configService.getOrThrow<string>('POSTGRES_USER');
  }

  get postgresPassword(): string {
    return this.configService.getOrThrow<string>('POSTGRES_PASSWORD');
  }

  get postgresDatabase(): string {
    return this.configService.getOrThrow<string>('POSTGRES_DB');
  }

  get postgresPort(): number {
    return this.configService.getOrThrow<number>('POSTGRES_PORT');
  }

  get postgresHost(): string {
    return this.configService.getOrThrow<string>('POSTGRES_HOST');
  }

  get postgresSchema(): string {
    return this.configService.getOrThrow<string>('POSTGRES_SCHEMA');
  }

  get redisHost(): string {
    return this.configService.getOrThrow<string>('REDIS_HOST');
  }

  get redisPort(): number {
    return this.configService.getOrThrow<number>('REDIS_PORT');
  }

  get smtpHost(): string {
    return this.configService.getOrThrow<string>('SMTP_HOST');
  }

  get smtpPort(): number {
    return this.configService.getOrThrow<number>('SMTP_PORT');
  }

  get smtpSecure(): boolean {
    return this.configService.getOrThrow<boolean>('SMTP_SECURE');
  }

  get smtpUser(): string {
    return this.configService.getOrThrow<string>('SMTP_USER');
  }

  get smtpPassword(): string {
    return this.configService.getOrThrow<string>('SMTP_PASSWORD');
  }

  get smtpFrom(): string {
    return this.configService.getOrThrow<string>('SMTP_FROM');
  }

  get nodeEnvironment(): NodeEnvironment {
    return this.configService.getOrThrow<NodeEnvironment>('NODE_ENV');
  }

  get isDevelopment(): boolean {
    return this.nodeEnvironment === NodeEnvironment.DEVELOPMENT;
  }

  get isProduction(): boolean {
    return this.nodeEnvironment === NodeEnvironment.PRODUCTION;
  }

  get isTest(): boolean {
    return this.nodeEnvironment === NodeEnvironment.TEST;
  }

  get databaseUrl(): string {
    return createDatabaseUrl({
      host: this.postgresHost,
      port: this.postgresPort,
      user: this.postgresUser,
      password: this.postgresPassword,
      database: this.postgresDatabase,
      schema: this.postgresSchema,
    });
  }
}
