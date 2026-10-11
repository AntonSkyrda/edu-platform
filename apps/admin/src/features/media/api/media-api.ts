import type { ApiResponse, MediaKind, MediaResponse } from '@project/contracts';

import { apiClient } from '@/shared/api/client';
import { API_ENDPOINTS } from '@/shared/api/endpoints';
export const mediaApi = {
  async upload(file: File, kind: MediaKind) {
    const data = new FormData();
    data.append('file', file);
    return (
      await apiClient.post<ApiResponse<MediaResponse>>(
        kind === 'IMAGE'
          ? API_ENDPOINTS.media.images
          : API_ENDPOINTS.media.pdfs,
        data,
        { authenticated: true, timeout: 60000 },
      )
    ).data.detail;
  },
  async get(id: string, signal?: AbortSignal) {
    return (
      await apiClient.get<ApiResponse<MediaResponse>>(
        API_ENDPOINTS.media.item(id),
        { authenticated: true, signal },
      )
    ).data.detail;
  },
  async content(id: string, signal?: AbortSignal): Promise<Blob> {
    return (
      await apiClient.get<Blob>(API_ENDPOINTS.media.content(id), {
        authenticated: true,
        signal,
        responseType: 'blob',
      })
    ).data;
  },
  async remove(id: string) {
    await apiClient.delete(API_ENDPOINTS.media.item(id), {
      authenticated: true,
    });
  },
};
