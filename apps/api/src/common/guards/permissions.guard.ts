import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@project/contracts';

import { PermissionsService } from '../../permissions/permissions.service';
import { REQUIRED_PERMISSIONS } from '../decorators/require-permissions.decorator';
import type { AuthRequest } from '../interfaces/auth-request.interface';
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    const { auth } = context.switchToHttp().getRequest<AuthRequest>();
    if (!required?.length || !auth) throw new ForbiddenException();
    await this.permissions.require(auth.user, required);
    return true;
  }
}
