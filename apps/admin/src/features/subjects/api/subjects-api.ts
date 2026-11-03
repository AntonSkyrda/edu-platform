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
  async get(id: string, signal?: AbortSignal) {
    return (
      await apiClient.get<ApiResponse<SubjectResponse>>(
        API_ENDPOINTS.subjects.item(id),
        { authenticated: true, signal },
      )
    ).data.detail;
  },
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
  async save(
    data: CreateSubjectRequest,
    current?: Pick<SubjectResponse, 'id' | 'version'>,
  ) {
    return (
      current
        ? await apiClient.patch<ApiResponse<SubjectResponse>>(
            API_ENDPOINTS.subjects.item(current.id),
            { ...data, expectedVersion: current.version },
            { authenticated: true },
          )
        : await apiClient.post<ApiResponse<SubjectResponse>>(
            API_ENDPOINTS.subjects.list,
            data,
            { authenticated: true },
          )
    ).data.detail;
  },
  async publish(
    id: string,
    status: PublicationStatus,
    expectedVersion: number,
  ) {
    return (
      await apiClient.patch<ApiResponse<SubjectResponse>>(
        API_ENDPOINTS.subjects.status(id),
        { status, expectedVersion },
        { authenticated: true },
      )
    ).data.detail;
  },
  async remove(id: string, expectedVersion: number) {
    await apiClient.delete(API_ENDPOINTS.subjects.item(id), {
      data: { expectedVersion },
      authenticated: true,
    });
  },
};
