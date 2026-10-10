import { PUBLICATION_STATUSES } from '@project/contracts';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { baseColumns } from './base.columns';
import { media } from './media';
export const publicationStatusEnum = pgEnum(
  'publication_status',
  PUBLICATION_STATUSES,
);
export const subjects = pgTable(
  'subjects',
  {
    ...baseColumns(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 150 }).notNull().unique(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: publicationStatusEnum('status').notNull().default('DRAFT'),
  },
  (t) => [
    index('subjects_public_order_idx').on(t.status, t.sortOrder, t.id),
    check('subjects_sort_order_check', sql`${t.sortOrder} >= 0`),
  ],
);
export const teachers = pgTable(
  'teachers',
  {
    ...baseColumns(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 200 }).notNull().unique(),
    photoId: uuid('photo_id').references(() => media.id, {
      onDelete: 'restrict',
    }),
    shortDescription: varchar('short_description', { length: 500 }),
    biography: text('biography'),
    status: publicationStatusEnum('status').notNull().default('DRAFT'),
  },
  (t) => [index('teachers_public_order_idx').on(t.status, t.lastName, t.id)],
);
export const teacherSubjects = pgTable(
  'teacher_subjects',
  {
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.teacherId, t.subjectId] }),
    index('teacher_subjects_subject_order_idx').on(
      t.subjectId,
      t.sortOrder,
      t.teacherId,
    ),
    check('teacher_subjects_sort_order_check', sql`${t.sortOrder} >= 0`),
  ],
);
