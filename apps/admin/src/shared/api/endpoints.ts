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
  subjects: {
    list: '/admin/subjects',
    item: (id: string) => `/admin/subjects/${encodeURIComponent(id)}`,
    status: (id: string) => `/admin/subjects/${encodeURIComponent(id)}/status`,
  },
  teachers: {
    list: '/admin/teachers',
    item: (id: string) => `/admin/teachers/${encodeURIComponent(id)}`,
    status: (id: string) => `/admin/teachers/${encodeURIComponent(id)}/status`,
    subjects: (id: string) =>
      `/admin/teachers/${encodeURIComponent(id)}/subjects`,
  },
  media: {
    images: '/admin/media/images',
    pdfs: '/admin/media/pdfs',
    item: (id: string) => `/admin/media/${encodeURIComponent(id)}`,
    content: (id: string) => `/admin/media/${encodeURIComponent(id)}/content`,
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
