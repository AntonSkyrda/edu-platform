import { resolve } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabaseUrl } from '@project/database';

import { NodeEnvironment } from './environment.types';

@Injectable()
export class EnvironmentService {
  constructor(private readonly configService: ConfigService) {}

  get storageDriver(): 'local' | 's3' {
    return this.configService.getOrThrow('STORAGE_DRIVER');
  }
  get storageLocalRoot(): string {
    return (
      this.configService.get<string>('STORAGE_LOCAL_ROOT') ||
      resolve(__dirname, '../../../../.storage')
    );
  }
  get s3Region(): string {
    return this.configService.getOrThrow('S3_REGION');
  }
  get s3Bucket(): string {
    return this.configService.getOrThrow('S3_BUCKET');
  }
  get s3Endpoint(): string | undefined {
    return this.configService.get<string>('S3_ENDPOINT') || undefined;
  }
  get s3AccessKeyId(): string {
    return this.configService.getOrThrow('S3_ACCESS_KEY_ID');
  }
  get s3SecretAccessKey(): string {
    return this.configService.getOrThrow('S3_SECRET_ACCESS_KEY');
  }
  get s3ForcePathStyle(): boolean {
    return this.configService.getOrThrow('S3_FORCE_PATH_STYLE');
  }
  get mediaImageMaxBytes(): number {
    return (
      this.configService.getOrThrow<number>('MEDIA_IMAGE_MAX_MB') * 1024 * 1024
    );
  }
  get mediaPdfMaxBytes(): number {
    return (
      this.configService.getOrThrow<number>('MEDIA_PDF_MAX_MB') * 1024 * 1024
    );
  }
  get mediaImageMaxPixels(): number {
    return this.configService.getOrThrow('MEDIA_IMAGE_MAX_PIXELS');
  }
  get mediaImageMaxDimension(): number {
    return this.configService.getOrThrow('MEDIA_IMAGE_MAX_DIMENSION');
  }
  get mediaPdfTimeoutMs(): number {
    return this.configService.getOrThrow('MEDIA_PDF_TIMEOUT_MS');
  }
  get mediaPdfMaxPages(): number {
    return this.configService.getOrThrow('MEDIA_PDF_MAX_PAGES');
  }
  get mediaOrphanTtlMs(): number {
    return (
      this.configService.getOrThrow<number>('MEDIA_ORPHAN_TTL_SECONDS') * 1000
    );
  }
  get mediaCleanupIntervalMs(): number {
    return (
      this.configService.getOrThrow<number>('MEDIA_CLEANUP_INTERVAL_SECONDS') *
      1000
    );
  }

  get passwordResetTokenSecret(): string {
    return this.configService.getOrThrow<string>('PASSWORD_RESET_TOKEN_SECRET');
  }
  get passwordResetTtlMs(): number {
    return (
      this.configService.getOrThrow<number>('PASSWORD_RESET_TTL_SECONDS') * 1000
    );
  }
  get passwordResetCooldownMs(): number {
    return (
      this.configService.getOrThrow<number>('PASSWORD_RESET_COOLDOWN_SECONDS') *
      1000
    );
  }
  get passwordResetDeliveryPollMs(): number {
    return (
      this.configService.getOrThrow<number>(
        'PASSWORD_RESET_DELIVERY_POLL_SECONDS',
      ) * 1000
    );
  }
  get passwordResetResponseMinMs(): number {
    return this.configService.getOrThrow<number>(
      'PASSWORD_RESET_RESPONSE_MIN_MS',
    );
  }

  get logLevel(): string {
    return this.configService.getOrThrow<string>('LOG_LEVEL');
  }

  get invitationDeliveryPollMs(): number {
    return (
      this.configService.getOrThrow<number>(
        'INVITATION_DELIVERY_POLL_SECONDS',
      ) * 1000
    );
  }

  get invitationTokenSecret(): string {
    return this.configService.getOrThrow<string>('INVITATION_TOKEN_SECRET');
  }

  get accessTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS');
  }
  get sessionTtlMs(): number {
    return this.configService.getOrThrow<number>('SESSION_TTL_SECONDS') * 1000;
  }
  get invitationTtlMs(): number {
    return (
      this.configService.getOrThrow<number>('INVITATION_TTL_SECONDS') * 1000
    );
  }
  get jwtIssuer(): string {
    return this.configService.getOrThrow<string>('JWT_ISSUER');
  }
  get jwtAudience(): string {
    return this.configService.getOrThrow<string>('JWT_AUDIENCE');
  }

  get accessJwtSecret(): string {
    return this.configService.getOrThrow<string>('ACCESS_JWT_SECRET');
  }

  get frontendOrigin(): string {
    return new URL(this.configService.getOrThrow<string>('FRONTEND_ORIGIN'))
      .origin;
  }

  get trustedRequestOrigins(): string[] {
    return [
      this.frontendOrigin,
      ...(this.isDevelopment
        ? [
            `http://localhost:${this.AppPort}`,
            `http://127.0.0.1:${this.AppPort}`,
          ]
        : []),
    ];
  }

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
