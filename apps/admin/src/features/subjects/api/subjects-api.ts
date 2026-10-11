import type {
  ApiResponse,
  CatalogPage,
  CreateSubjectRequest,
  PublicationStatus,
  SubjectResponse,
} from '@project/contracts';

import { apiClient } from '@/shared/api/client';
import { API_ENDPOINTS } from '@/shared/api/endpoints';
export const subjectsApi = {
  async list(page: number, signal?: AbortSignal) {
    return (
      await apiClient.get<ApiResponse<CatalogPage<SubjectResponse>>>(
        API_ENDPOINTS.subjects.list,
        {
          authenticated: true,
          signal,
          params: { limit: 20, offset: page * 20 },
        },
      )
    ).data.detail;
  },
  async save(data: CreateSubjectRequest, id?: string) {
    return (
      id
        ? await apiClient.patch<ApiResponse<SubjectResponse>>(
            API_ENDPOINTS.subjects.item(id),
            data,
            { authenticated: true },
          )
        : await apiClient.post<ApiResponse<SubjectResponse>>(
            API_ENDPOINTS.subjects.list,
            data,
            { authenticated: true },
          )
    ).data.detail;
  },
  async publish(id: string, status: PublicationStatus) {
    return (
      await apiClient.patch<ApiResponse<SubjectResponse>>(
        API_ENDPOINTS.subjects.status(id),
        { status },
        { authenticated: true },
      )
    ).data.detail;
  },
  async remove(id: string) {
    await apiClient.delete(API_ENDPOINTS.subjects.item(id), {
      authenticated: true,
    });
  },
};
