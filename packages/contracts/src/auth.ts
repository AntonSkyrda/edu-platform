export const USER_ROLES = ['ADMIN', 'MANAGER', 'TEACHER', 'STUDENT'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const INVITABLE_ROLES = ['MANAGER', 'TEACHER', 'STUDENT'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];
export type UserStatus = 'INVITED' | 'ACTIVE' | 'BLOCKED';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
}
export interface InviteUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: InvitableRole;
}
export interface AcceptInvitationRequest {
  token: string;
  password: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface AuthResponse {
  expiresIn: number;
  user: AuthUser;
}

export interface ForgotPasswordRequest {
  email: string;
}
export interface ResetPasswordRequest {
  token: string;
  password: string;
}
