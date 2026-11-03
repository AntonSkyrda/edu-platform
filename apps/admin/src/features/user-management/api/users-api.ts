import type {
  ApiResponse,
  AuthUser,
  DeliveryStatus,
  InviteUserRequest,
  Permission,
  PermissionsResponse,
  UsersPage,
} from '@project/contracts';

import { apiClient } from '@/shared/api/client';
import { API_ENDPOINTS } from '@/shared/api/endpoints';
export const usersApi = {
  async delivery(signal?: AbortSignal) {
    return (
      await apiClient.get<ApiResponse<DeliveryStatus>>(
        API_ENDPOINTS.users.delivery,
        { authenticated: true, signal },
      )
    ).data.detail;
  },
  async permissions(id: string, signal?: AbortSignal) {
    return (
      await apiClient.get<ApiResponse<PermissionsResponse>>(
        API_ENDPOINTS.users.permissions(id),
        { authenticated: true, signal },
      )
    ).data.detail;
  },
  async setPermissions(
    id: string,
    permissions: Permission[],
    expectedVersion: number,
  ) {
    return (
      await apiClient.put<ApiResponse<PermissionsResponse>>(
        API_ENDPOINTS.users.permissions(id),
        { permissions, expectedVersion },
        { authenticated: true },
      )
    ).data.detail;
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
