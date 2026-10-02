import { USER_ROLES } from '@project/contracts';
import { sql } from 'drizzle-orm';
import { pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { baseColumns } from './base.columns';

export const userRoleEnum = pgEnum('user_role', USER_ROLES);

export const userStatusEnum = pgEnum('user_status', [
  'INVITED',
  'ACTIVE',
  'BLOCKED',
]);

export const users = pgTable(
  'users',
  {
    ...baseColumns(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    role: userRoleEnum('role').notNull(),
    status: userStatusEnum('status').default('INVITED').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(sql`lower(${table.email})`)],
);
