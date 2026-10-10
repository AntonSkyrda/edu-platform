import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@project/contracts';
export const REQUIRED_PERMISSIONS = 'requiredPermissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
