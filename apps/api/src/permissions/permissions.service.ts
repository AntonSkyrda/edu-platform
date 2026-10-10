import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  type AuthUser,
  type Permission,
  PERMISSIONS,
} from '@project/contracts';
import type { Transaction } from '@project/database';

import { UsersService } from '../users/users.service';
import { PermissionsRepository } from './permissions.repository';
@Injectable()
export class PermissionsService {
  constructor(
    private readonly repository: PermissionsRepository,
    private readonly users: UsersService,
  ) {}
  async effective(user: AuthUser, tx?: Transaction): Promise<Permission[]> {
    if (user.status !== 'ACTIVE') return [];
    if (user.role === 'ADMIN') return [...PERMISSIONS];
    if (user.role !== 'MANAGER') return [];
    return this.repository.list(user.id, tx);
  }
  async require(
    user: AuthUser,
    required: readonly Permission[],
    tx?: Transaction,
  ) {
    const granted = await this.effective(user, tx);
    if (!required.every((permission) => granted.includes(permission)))
      throw new ForbiddenException('Insufficient permissions');
  }
  async getAssigned(userId: string, tx: Transaction) {
    await this.users.getByIdOrThrow(userId, { transaction: tx });
    return { permissions: await this.repository.list(userId, tx) };
  }
  async replace(userId: string, permissions: Permission[], tx: Transaction) {
    const user = await this.users.getByIdOrThrow(userId, {
      transaction: tx,
      lock: 'update',
    });
    if (user.role !== 'MANAGER')
      throw new BadRequestException(
        'Permissions can only be assigned to managers',
      );
    return {
      permissions: await this.repository.replace(userId, permissions, tx),
    };
  }
}
