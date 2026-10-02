import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { baseColumns } from './base.columns';
import { users } from './users';

export const userInvitations = pgTable(
  'user_invitations',
  {
    ...baseColumns(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    deliveryStatus: text('delivery_status', {
      enum: ['pending', 'sent', 'failed', 'skipped'],
    })
      .notNull()
      .default('pending'),
    deliveryAttempts: integer('delivery_attempts').notNull().default(0),
    deliveryError: text('delivery_error'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('user_invitations_user_id_idx').on(table.userId)],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    ...baseColumns(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('user_sessions_user_id_idx').on(table.userId)],
);

export const passwordResets = pgTable(
  'password_resets',
  {
    ...baseColumns(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    deliveryStatus: text('delivery_status', {
      enum: ['pending', 'sent', 'failed', 'skipped'],
    })
      .notNull()
      .default('pending'),
    deliveryAttempts: integer('delivery_attempts').notNull().default(0),
    deliveryError: text('delivery_error'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    notificationStatus: text('notification_status', {
      enum: ['pending', 'sent', 'failed'],
    }),
    notificationError: text('notification_error'),
    notificationAttempts: integer('notification_attempts').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('password_resets_user_id_idx').on(table.userId),
    index('password_resets_delivery_idx').on(
      table.deliveryStatus,
      table.createdAt,
    ),
    index('password_resets_notification_idx').on(
      table.notificationStatus,
      table.createdAt,
    ),
  ],
);
