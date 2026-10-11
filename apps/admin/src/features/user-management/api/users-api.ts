import type {
  ApiResponse,
  AuthUser,
  InviteUserRequest,
  Permission,
  PermissionsResponse,
  UsersPage,
} from '@project/contracts';

import { apiClient } from '@/shared/api/client';
import { API_ENDPOINTS } from '@/shared/api/endpoints';
export const usersApi = {
  async permissions(id: string, signal?: AbortSignal) {
    return (
      await apiClient.get<ApiResponse<PermissionsResponse>>(
        API_ENDPOINTS.users.permissions(id),
        { authenticated: true, signal },
      )
    ).data.detail.permissions;
  },
  async setPermissions(id: string, permissions: Permission[]) {
    return (
      await apiClient.put<ApiResponse<PermissionsResponse>>(
        API_ENDPOINTS.users.permissions(id),
        { permissions },
        { authenticated: true },
      )
    ).data.detail.permissions;
  },
  async list(page: number, signal?: AbortSignal) {
    return (
      await apiClient.get<ApiResponse<UsersPage>>(API_ENDPOINTS.users.list, {
        authenticated: true,
        signal,
        params: { limit: 20, offset: page * 20 },
      })
    ).data.detail;
  },
  async invite(data: InviteUserRequest) {
    return (
      await apiClient.post<ApiResponse<AuthUser>>(
        API_ENDPOINTS.users.invite,
        data,
        {
          authenticated: true,
        },
      )
    ).data.detail;
  },
  async action({
    id,
    action,
  }: {
    id: string;
    action: 'resend' | 'block' | 'unblock';
  }) {
    await apiClient.post(API_ENDPOINTS.users[action](id), undefined, {
      authenticated: true,
    });
  },
};
