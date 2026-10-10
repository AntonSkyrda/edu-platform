import { Injectable } from '@nestjs/common';
import type { Permission } from '@project/contracts';
import { eq, type Transaction } from '@project/database';
import { userPermissions } from '@project/database/schema';

import { DatabaseService } from '../database/database.service';
@Injectable()
export class PermissionsRepository {
  constructor(private readonly database: DatabaseService) {}
  async list(userId: string, tx?: Transaction): Promise<Permission[]> {
    const rows = await (tx ?? this.database.db)
      .select({ permission: userPermissions.permission })
      .from(userPermissions)
      .where(eq(userPermissions.userId, userId))
      .orderBy(userPermissions.permission);
    return rows.map((row) => row.permission);
  }
  async replace(userId: string, permissions: Permission[], tx: Transaction) {
    await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
    if (permissions.length)
      await tx
        .insert(userPermissions)
        .values(permissions.map((permission) => ({ userId, permission })));
    return this.list(userId, tx);
  }
}
