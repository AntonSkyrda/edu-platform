import type { VersionedRequest } from './version';

export const PUBLICATION_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
export interface CreateSubjectRequest {
  name: string;
  sortOrder?: number;
}
export type UpdateSubjectRequest = Partial<CreateSubjectRequest> &
  VersionedRequest;
export interface CreateTeacherRequest {
  firstName: string;
  lastName: string;
  photoId?: string | null;
  shortDescription?: string | null;
  biography?: string | null;
}
export type UpdateTeacherRequest = Partial<CreateTeacherRequest> &
  VersionedRequest;
export interface SubjectResponse {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  status: PublicationStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export interface TeacherResponse {
  id: string;
  firstName: string;
  lastName: string;
  slug: string;
  photoId: string | null;
  shortDescription: string | null;
  biography: string | null;
  status: PublicationStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export interface CatalogPage<T> {
  items: T[];
  hasMore: boolean;
}
export interface TeacherSubjectAssignment {
  subjectId: string;
  sortOrder: number;
}
export interface TeacherSubjectsResponse {
  items: TeacherSubjectAssignment[];
  version: number;
}
export interface SetTeacherSubjectsRequest extends VersionedRequest {
  subjects: TeacherSubjectAssignment[];
}
export interface SetPublicationStatusRequest extends VersionedRequest {
  status: PublicationStatus;
}
