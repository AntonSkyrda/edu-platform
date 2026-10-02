import type {
  passwordResets,
  userInvitations,
  userSessions,
} from './schema/auth';
import type { users } from './schema/users';

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = User['role'];
export type UserStatus = User['status'];

export type UserInvitation = typeof userInvitations.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;

export type PasswordReset = typeof passwordResets.$inferSelect;
