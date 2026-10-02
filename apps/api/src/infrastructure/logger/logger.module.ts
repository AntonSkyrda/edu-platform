import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import { EnvironmentModule } from '../../config/environment.module';
import { EnvironmentService } from '../../config/environment.service';
import { createLoggerOptions } from '../../config/logger.config';
import { RequestContextMiddleware } from './request-context.middleware';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [EnvironmentModule],
      inject: [EnvironmentService],
      useFactory: (environment: EnvironmentService) => ({
        pinoHttp: createLoggerOptions(environment),
      }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*path}');
  }
}
