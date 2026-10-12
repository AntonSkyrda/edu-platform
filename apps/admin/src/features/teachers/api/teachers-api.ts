import type {
  ApiResponse,
  CatalogPage,
  CreateTeacherRequest,
  PublicationStatus,
  TeacherResponse,
  TeacherSubjectAssignment,
} from '@project/contracts';

import { apiClient } from '@/shared/api/client';
import { API_ENDPOINTS } from '@/shared/api/endpoints';
export const teachersApi = {
  async list(page: number, signal?: AbortSignal) {
    return (
      await apiClient.get<ApiResponse<CatalogPage<TeacherResponse>>>(
        API_ENDPOINTS.teachers.list,
        {
          authenticated: true,
          signal,
          params: { limit: 20, offset: page * 20 },
        },
      )
    ).data.detail;
  },
  async save(data: CreateTeacherRequest, id?: string) {
    return (
      id
        ? await apiClient.patch<ApiResponse<TeacherResponse>>(
            API_ENDPOINTS.teachers.item(id),
            data,
            { authenticated: true },
          )
        : await apiClient.post<ApiResponse<TeacherResponse>>(
            API_ENDPOINTS.teachers.list,
            data,
            { authenticated: true },
          )
    ).data.detail;
  },
  async publish(id: string, status: PublicationStatus) {
    return (
      await apiClient.patch<ApiResponse<TeacherResponse>>(
        API_ENDPOINTS.teachers.status(id),
        { status },
        { authenticated: true },
      )
    ).data.detail;
  },
  async remove(id: string) {
    await apiClient.delete(API_ENDPOINTS.teachers.item(id), {
      authenticated: true,
    });
  },

  async assignments(id: string, signal?: AbortSignal) {
    return (
      await apiClient.get<ApiResponse<{ items: TeacherSubjectAssignment[] }>>(
        API_ENDPOINTS.teachers.subjects(id),
        { authenticated: true, signal },
      )
    ).data.detail.items;
  },
  async setAssignments(id: string, subjects: TeacherSubjectAssignment[]) {
    return (
      await apiClient.put<ApiResponse<{ items: TeacherSubjectAssignment[] }>>(
        API_ENDPOINTS.teachers.subjects(id),
        { subjects },
        { authenticated: true },
      )
    ).data.detail.items;
  },
};
