import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { EnvironmentService } from '../../config/environment.service';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly environment: EnvironmentService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    if (
      request.headers.origin &&
      !this.environment.trustedRequestOrigins.includes(request.headers.origin)
    )
      throw new ForbiddenException('Untrusted origin');
    if (request.headers['sec-fetch-site'] === 'cross-site')
      throw new ForbiddenException('Cross-site requests are not allowed');
    return true;
  }
}
