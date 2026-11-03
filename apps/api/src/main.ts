import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { EnvironmentService } from './config/environment.service';
import { configureHttpApp } from './config/http.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const environmentService = app.get(EnvironmentService);

  configureHttpApp(app);

  await app.listen(environmentService.AppPort);
}

bootstrap();
