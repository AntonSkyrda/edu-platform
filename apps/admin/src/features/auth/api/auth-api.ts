import type {
  ApiResponse,
  AuthResponse,
  AuthUser,
  LoginRequest,
} from '@project/contracts';

import { apiClient } from '@/shared/api/client';
import { API_ENDPOINTS } from '@/shared/api/endpoints';

export const authApi = {
  async me(signal?: AbortSignal, authenticated = true) {
    return (
      await apiClient.get<ApiResponse<AuthUser>>(API_ENDPOINTS.auth.me, {
        signal,
        authenticated,
      })
    ).data.detail;
  },
  async login(data: LoginRequest) {
    return (
      await apiClient.post<ApiResponse<AuthResponse>>(
        API_ENDPOINTS.auth.login,
        data,
      )
    ).data.detail;
  },
  async refresh() {
    return (
      await apiClient.post<ApiResponse<AuthResponse>>(
        API_ENDPOINTS.auth.refresh,
      )
    ).data.detail;
  },
  async logout() {
    await apiClient.post(API_ENDPOINTS.auth.logout);
  },
  async forgotPassword(email: string) {
    await apiClient.post(API_ENDPOINTS.auth.forgotPassword, { email });
  },
  async setPassword(
    mode: 'invitation' | 'recovery',
    token: string,
    password: string,
  ) {
    await apiClient.post(
      mode === 'invitation'
        ? API_ENDPOINTS.auth.acceptInvitation
        : API_ENDPOINTS.auth.resetPassword,
      { token, password },
    );
  },
};
