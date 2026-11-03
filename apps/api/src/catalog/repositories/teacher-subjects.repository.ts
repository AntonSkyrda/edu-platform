import { Injectable } from '@nestjs/common';
import type { TeacherSubjectAssignment } from '@project/contracts';
import {
  and,
  asc,
  eq,
  inArray,
  sql,
  type Transaction,
} from '@project/database';
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
  async lockSubjects(ids: string[], tx: Transaction) {
    if (!ids.length) return [];
    // Every assignment writer locks referenced subjects before its teacher.
    // KEY SHARE permits concurrent assignments but excludes subject deletion.
    return tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(inArray(subjects.id, ids))
      .orderBy(asc(subjects.id))
      .for('key share');
  }
  async bumpTeachersForSubjectDeletion(subjectId: string, tx: Transaction) {
    // The caller holds the subject FOR UPDATE: no new link can be inserted.
    const linkedTeachers = tx
      .select({ id: teacherSubjects.teacherId })
      .from(teacherSubjects)
      .where(eq(teacherSubjects.subjectId, subjectId));
    await tx
      .select({ id: teachers.id })
      .from(teachers)
      .where(inArray(teachers.id, linkedTeachers))
      .orderBy(asc(teachers.id))
      .for('update');
    // A teacher may have removed its link (or been deleted) while we waited.
    // Re-read links after acquiring all teacher locks; only actual cascades bump.
    await tx
      .update(teachers)
      .set({ version: sql`${teachers.version} + 1` })
      .where(inArray(teachers.id, linkedTeachers));
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
