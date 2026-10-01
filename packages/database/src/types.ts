import type { users } from './schema/users';

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = User['role'];
export type UserStatus = User['status'];
