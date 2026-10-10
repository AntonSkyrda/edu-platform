import { Injectable } from '@nestjs/common';
import type { TeacherSubjectAssignment } from '@project/contracts';
import { and, asc, eq, type Transaction } from '@project/database';
import { subjects, teachers, teacherSubjects } from '@project/database/schema';

import { DatabaseService } from '../../database/database.service';
@Injectable()
export class TeacherSubjectsRepository {
  constructor(private readonly database: DatabaseService) {}
  async list(teacherId: string, tx?: Transaction) {
    return (tx ?? this.database.db)
      .select({
        subjectId: teacherSubjects.subjectId,
        sortOrder: teacherSubjects.sortOrder,
      })
      .from(teacherSubjects)
      .where(eq(teacherSubjects.teacherId, teacherId))
      .orderBy(asc(teacherSubjects.sortOrder), asc(teacherSubjects.subjectId));
  }
  async replace(
    teacherId: string,
    assignments: TeacherSubjectAssignment[],
    tx: Transaction,
  ) {
    await tx
      .delete(teacherSubjects)
      .where(eq(teacherSubjects.teacherId, teacherId));
    if (assignments.length)
      await tx
        .insert(teacherSubjects)
        .values(
          assignments
            .map((a) => ({ teacherId, ...a }))
            .sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
        );
    return this.list(teacherId, tx);
  }
  async publishedTeachers(subjectId: string, limit: number, offset: number) {
    const rows = await this.database.db
      .select({ teacher: teachers })
      .from(teacherSubjects)
      .innerJoin(teachers, eq(teachers.id, teacherSubjects.teacherId))
      .innerJoin(subjects, eq(subjects.id, teacherSubjects.subjectId))
      .where(
        and(
          eq(subjects.id, subjectId),
          eq(subjects.status, 'PUBLISHED'),
          eq(teachers.status, 'PUBLISHED'),
        ),
      )
      .orderBy(asc(teacherSubjects.sortOrder), asc(teachers.id))
      .limit(limit)
      .offset(offset);
    return rows.map((row) => row.teacher);
  }
}
