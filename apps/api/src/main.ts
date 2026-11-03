import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestNodeApplication } from '@nestjs/platform-node';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { EnvironmentService } from './config/environment.service';
import { createHttpAdapter } from './config/http-adapter';
import { configureHttpApp } from './config/http.config';
import { parseTrustedProxies } from './config/proxy.config';

async function bootstrap() {
  // The adapter needs proxy options before Nest creates the HTTP server.
  await ConfigModule.envVariablesLoaded;
  const app = await NestFactory.create<NestNodeApplication>(
    AppModule,
    createHttpAdapter(parseTrustedProxies(process.env.TRUSTED_PROXIES ?? '')),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const environmentService = app.get(EnvironmentService);

  configureHttpApp(app);

  await app.listen(environmentService.AppPort);
}

bootstrap();
