import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from '../auth/constants/auth.constants';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Edu Platform API')
    .setDescription(
      'Invitation-only platform. Login and refresh set HttpOnly cookies; tokens are never returned in JSON. Access cookies use Path=/; refresh cookies use Path=/auth. Both use SameSite=Strict and Secure in production. Unsafe browser requests must originate from FRONTEND_ORIGIN. In development, the local Swagger origin is also allowed. Use Try it out on POST /auth/login first; the browser stores HttpOnly cookies and sends them on subsequent requests automatically. Do not paste tokens into Authorize. Create the first administrator with pnpm admin:create.',
    )
    .setVersion('1.0')
    .addCookieAuth(
      ACCESS_COOKIE,
      { type: 'apiKey', in: 'cookie' },
      'accessCookie',
    )
    .addCookieAuth(
      REFRESH_COOKIE,
      { type: 'apiKey', in: 'cookie' },
      'refreshCookie',
    )
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    () => SwaggerModule.createDocument(app, config),
    {
      jsonDocumentUrl: 'docs-json',
      swaggerOptions: { withCredentials: true },
    },
  );
}
