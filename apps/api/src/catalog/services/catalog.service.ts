import { Injectable } from '@nestjs/common';

import { SubjectsService } from './subjects.service';
import { TeachersService } from './teachers.service';

@Injectable()
export class CatalogService {
  constructor(
    private readonly subjects: SubjectsService,
    private readonly teachers: TeachersService,
  ) {}

  listSubjects(limit: number, offset: number) {
    return this.subjects.list(limit, offset, true);
  }

  getSubject(slug: string) {
    return this.subjects.getPublished(slug);
  }

  async listSubjectTeachers(slug: string, limit: number, offset: number) {
    const subject = await this.subjects.getPublished(slug);
    return this.teachers.listForSubject(subject.id, limit, offset);
  }

  listTeachers(limit: number, offset: number) {
    return this.teachers.list(limit, offset, true);
  }

  getTeacherPhoto(slug: string) {
    return this.teachers.getPublishedPhoto(slug);
  }

  getTeacher(slug: string) {
    return this.teachers.getPublished(slug);
  }
}
