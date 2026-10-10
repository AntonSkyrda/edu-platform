import { Injectable } from '@nestjs/common';
import type { TeacherSubjectAssignment } from '@project/contracts';
import type { Transaction } from '@project/database';

import { TeacherSubjectsRepository } from '../repositories/teacher-subjects.repository';
@Injectable()
export class TeacherSubjectsService {
  constructor(private readonly repository: TeacherSubjectsRepository) {}
  list(teacherId: string, tx?: Transaction) {
    return this.repository.list(teacherId, tx);
  }
  replace(
    teacherId: string,
    assignments: TeacherSubjectAssignment[],
    tx: Transaction,
  ) {
    return this.repository.replace(teacherId, assignments, tx);
  }
  publishedTeachers(subjectId: string, limit: number, offset: number) {
    return this.repository.publishedTeachers(subjectId, limit, offset);
  }
}
