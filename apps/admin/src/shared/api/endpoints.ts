export const API_ENDPOINTS = {
  auth: {
    me: '/auth/me',
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
    acceptInvitation: '/auth/invitations/accept',
  },
  users: {
    list: '/auth/users',
    permissions: (id: string) =>
      `/auth/users/${encodeURIComponent(id)}/permissions`,
    invite: '/auth/invitations',
    resend: (id: string) =>
      `/auth/invitations/${encodeURIComponent(id)}/resend`,
    block: (id: string) => `/auth/users/${encodeURIComponent(id)}/block`,
    unblock: (id: string) => `/auth/users/${encodeURIComponent(id)}/unblock`,
  },
} as const;
