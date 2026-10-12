import type { SubjectResponse, TeacherResponse } from '@project/contracts';
import type { Subject, Teacher } from '@project/database/types';
export function toSubject(s: Subject): SubjectResponse {
  return {
    id: s.id,
    version: s.version,
    name: s.name,
    slug: s.slug,
    sortOrder: s.sortOrder,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
export function toTeacher(t: Teacher): TeacherResponse {
  return {
    id: t.id,
    version: t.version,
    firstName: t.firstName,
    lastName: t.lastName,
    slug: t.slug,
    photoId: t.photoId,
    shortDescription: t.shortDescription,
    biography: t.biography,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
