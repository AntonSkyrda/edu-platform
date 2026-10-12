import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AllExceptionFilter } from '../common/filters/all-exception.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { LifecycleService } from '../infrastructure/lifecycle/lifecycle.service';
import { RequestLifecycleInterceptor } from '../infrastructure/lifecycle/request-lifecycle.interceptor';
import { EnvironmentService } from './environment.service';
import { configureTrustedProxies } from './proxy.config';
import { setupSwagger } from './swagger.config';

export function configureHttpApp(app: NestExpressApplication): void {
  const environmentService = app.get(EnvironmentService);

  configureTrustedProxies(app, environmentService.trustedProxies);
  app.use(app.get(LifecycleService).middleware);
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
