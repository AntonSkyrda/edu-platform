import { MEDIA_KINDS } from '@project/contracts';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { baseColumns } from './base.columns';
export const mediaKindEnum = pgEnum('media_kind', MEDIA_KINDS);
export const mediaStateEnum = pgEnum('media_state', ['UPLOADING', 'READY']);
export const storageDriverEnum = pgEnum('storage_driver', ['local', 's3']);
export const media = pgTable(
  'media',
  {
    ...baseColumns(),
    kind: mediaKindEnum('kind').notNull(),
    state: mediaStateEnum('state').notNull().default('UPLOADING'),
    storageDriver: storageDriverEnum('storage_driver').notNull(),
    objectKey: text('object_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    pageCount: integer('page_count'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [index('media_expiry_idx').on(t.expiresAt)],
);
export const mediaDeletions = pgTable(
  'media_deletions',
  {
    ...baseColumns(),
    objectKey: text('object_key').notNull().unique(),
    storageDriver: storageDriverEnum('storage_driver').notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('media_deletions_retry_idx').on(t.nextAttemptAt)],
);
