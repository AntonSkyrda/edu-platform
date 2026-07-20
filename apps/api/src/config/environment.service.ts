import { ConfigService } from '@nestjs/config';
import { NodeEnvironment } from './environment.types';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EnvironmentService {
  constructor(private readonly configService: ConfigService) {}

  getAppPort(): number {
    return this.configService.getOrThrow<number>('APP_PORT');
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
}
