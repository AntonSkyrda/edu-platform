import type {
  ApiResponse,
  CatalogPage,
  CreateTeacherRequest,
  PublicationStatus,
  TeacherResponse,
  TeacherSubjectAssignment,
  TeacherSubjectsResponse,
} from '@project/contracts';

import { apiClient } from '@/shared/api/client';
import { API_ENDPOINTS } from '@/shared/api/endpoints';
export const teachersApi = {
  async get(id: string) {
    return (
      await apiClient.get<ApiResponse<TeacherResponse>>(
        API_ENDPOINTS.teachers.item(id),
        { authenticated: true },
      )
    ).data.detail;
  },
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
  async save(
    data: CreateTeacherRequest,
    current?: Pick<TeacherResponse, 'id' | 'version'>,
  ) {
    return (
      current
        ? await apiClient.patch<ApiResponse<TeacherResponse>>(
            API_ENDPOINTS.teachers.item(current.id),
            { ...data, expectedVersion: current.version },
            { authenticated: true },
          )
        : await apiClient.post<ApiResponse<TeacherResponse>>(
            API_ENDPOINTS.teachers.list,
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
      await apiClient.patch<ApiResponse<TeacherResponse>>(
        API_ENDPOINTS.teachers.status(id),
        { status, expectedVersion },
        { authenticated: true },
      )
    ).data.detail;
  },
  async remove(id: string, expectedVersion: number) {
    await apiClient.delete(API_ENDPOINTS.teachers.item(id), {
      data: { expectedVersion },
      authenticated: true,
    });
  },

  async assignments(id: string, signal?: AbortSignal) {
    return (
      await apiClient.get<ApiResponse<TeacherSubjectsResponse>>(
        API_ENDPOINTS.teachers.subjects(id),
        { authenticated: true, signal },
      )
    ).data.detail;
  },
  async setAssignments(
    id: string,
    subjects: TeacherSubjectAssignment[],
    expectedVersion: number,
  ) {
    return (
      await apiClient.put<ApiResponse<TeacherSubjectsResponse>>(
        API_ENDPOINTS.teachers.subjects(id),
        { subjects, expectedVersion },
        { authenticated: true },
      )
    ).data.detail;
  },
};
