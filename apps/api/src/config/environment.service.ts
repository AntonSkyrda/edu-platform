import { ConfigService } from '@nestjs/config';
import { NodeEnvironment } from './environment.types';
import { Injectable } from '@nestjs/common';

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
    const username = encodeURIComponent(this.postgresUser);
    const password = encodeURIComponent(this.postgresPassword);
    const database = encodeURIComponent(this.postgresDatabase);
    const schema = encodeURIComponent(this.postgresSchema);

    return [
      `postgresql://${username}:${password}`,
      `@${this.postgresHost}:${this.postgresPort}`,
      `/${database}?schema=${schema}`,
    ].join('');
  }
}
