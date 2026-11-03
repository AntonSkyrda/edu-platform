import { ValidationPipe } from '@nestjs/common';
import type { NestNodeApplication } from '@nestjs/platform-node';

import { AllExceptionFilter } from '../common/filters/all-exception.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { LifecycleService } from '../infrastructure/lifecycle/lifecycle.service';
import { RequestLifecycleInterceptor } from '../infrastructure/lifecycle/request-lifecycle.interceptor';
import { EnvironmentService } from './environment.service';
import { ApplicationHttpAdapter } from './http-adapter';
import { setupSwagger } from './swagger.config';

export function configureHttpApp(app: NestNodeApplication): void {
  const environmentService = app.get(EnvironmentService);

  const lifecycle = app.get(LifecycleService);
  const adapter = app.getHttpAdapter();
  if (!(adapter instanceof ApplicationHttpAdapter))
    throw new Error('Configure the application with createHttpAdapter()');
  adapter.setDrainHandler(() => lifecycle.drain());
  app.use(lifecycle.middleware);
  app.useGlobalInterceptors(new RequestLifecycleInterceptor());

  app.enableCors({
    origin: environmentService.frontendOrigin,
    credentials: true,
    exposedHeaders: [
      'X-Request-Id',
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
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
}
