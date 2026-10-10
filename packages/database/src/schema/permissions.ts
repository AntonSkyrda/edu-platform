import { PERMISSIONS } from '@project/contracts';
import { pgEnum, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';
export const permissionEnum = pgEnum('permission', PERMISSIONS);
export const userPermissions = pgTable(
  'user_permissions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permission: permissionEnum('permission').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.permission] })],
);
