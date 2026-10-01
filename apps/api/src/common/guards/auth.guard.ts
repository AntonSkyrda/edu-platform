import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parseCookie } from 'cookie';

import { AuthService } from '../../auth/auth.service';
import { ACCESS_COOKIE } from '../../auth/constants/auth.constants';
import { PUBLIC_ROUTE_KEY } from '../decorators/public.decorator';
import type { AuthRequest } from '../interfaces/auth-request.interface';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = parseCookie(request.headers.cookie ?? '')[ACCESS_COOKIE];
    if (!token) throw new UnauthorizedException();
    request.auth = await this.auth.authenticate(token);
    return true;
  }
}
