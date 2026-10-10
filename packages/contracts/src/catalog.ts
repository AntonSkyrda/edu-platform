export const PUBLICATION_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
export interface CreateSubjectRequest {
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
}
export type UpdateSubjectRequest = Partial<CreateSubjectRequest>;
export interface CreateTeacherRequest {
  firstName: string;
  lastName: string;
  slug: string;
  photoId?: string | null;
  shortDescription?: string | null;
  biography?: string | null;
}
export type UpdateTeacherRequest = Partial<CreateTeacherRequest>;
export interface SubjectResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  status: PublicationStatus;
  createdAt: string;
  updatedAt: string;
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
}
export interface CatalogPage<T> {
  items: T[];
  hasMore: boolean;
}
export interface TeacherSubjectAssignment {
  subjectId: string;
  sortOrder: number;
}
export interface SetTeacherSubjectsRequest {
  subjects: TeacherSubjectAssignment[];
}
export interface SetPublicationStatusRequest {
  status: PublicationStatus;
}
