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
  async lockSubjects(assignments: TeacherSubjectAssignment[], tx: Transaction) {
    const ids = [...new Set(assignments.map((item) => item.subjectId))];
    const rows = await this.repository.lockSubjects(ids, tx);
    return rows.length === ids.length;
  }
  prepareSubjectDeletion(subjectId: string, tx: Transaction) {
    return this.repository.bumpTeachersForSubjectDeletion(subjectId, tx);
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
