import { Injectable } from '@nestjs/common';
import type { Permission } from '@project/contracts';
import { eq, type Transaction } from '@project/database';
import { userPermissions, users } from '@project/database/schema';

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
  async snapshot(userId: string, tx: Transaction) {
    // One SQL snapshot prevents pairing an old version with a newer grant set.
    const rows = await tx
      .select({
        version: users.permissionsVersion,
        permission: userPermissions.permission,
      })
      .from(users)
      .leftJoin(userPermissions, eq(users.id, userPermissions.userId))
      .where(eq(users.id, userId))
      .orderBy(userPermissions.permission);
    if (!rows.length) return null;
    return {
      version: rows[0].version,
      permissions: rows.flatMap((row) =>
        row.permission ? [row.permission] : [],
      ),
    };
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
