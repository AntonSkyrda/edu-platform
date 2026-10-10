import type {
  ApiResponse,
  AuthUser,
  InviteUserRequest,
  UsersPage,
} from '@project/contracts';

import { apiClient } from '@/shared/api/client';
import { API_ENDPOINTS } from '@/shared/api/endpoints';
export const usersApi = {
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
