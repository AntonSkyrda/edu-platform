import type { AuthUser } from './auth';
export const PERMISSIONS = [
  'subjects.read',
  'subjects.create',
  'subjects.update',
  'subjects.publish',
  'subjects.delete',
  'teachers.read',
  'teachers.create',
  'teachers.update',
  'teachers.publish',
  'teachers.delete',
  'media.read',
  'media.upload',
  'media.delete',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export interface SetPermissionsRequest {
  permissions: Permission[];
}
export interface PermissionsResponse {
  permissions: Permission[];
}
export interface CurrentUser extends AuthUser {
  permissions: Permission[];
}
