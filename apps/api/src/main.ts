import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AllExceptionFilter } from './common/filters/all-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { EnvironmentService } from './config/environment.service';
import { setupSwagger } from './config/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const environmentService = app.get(EnvironmentService);

  app.enableCors({
    origin: environmentService.frontendOrigin,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (!environmentService.isProduction) setupSwagger(app);

  await app.listen(environmentService.AppPort);
}

bootstrap();
