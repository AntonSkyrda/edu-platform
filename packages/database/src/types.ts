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

import type { subjects, teachers, teacherSubjects } from './schema/catalog';
export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
export type Teacher = typeof teachers.$inferSelect;
export type NewTeacher = typeof teachers.$inferInsert;
export type TeacherSubject = typeof teacherSubjects.$inferSelect;

import type { media, mediaDeletions } from './schema/media';
export type Media = typeof media.$inferSelect;
export type MediaDeletion = typeof mediaDeletions.$inferSelect;

import type { userPermissions } from './schema/permissions';
export type UserPermission = typeof userPermissions.$inferSelect;
