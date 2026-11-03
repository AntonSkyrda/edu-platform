import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AuthUser,
  CreateTeacherRequest,
  PublicationStatus,
  TeacherSubjectAssignment,
  UpdateTeacherRequest,
} from '@project/contracts';
import type { Teacher } from '@project/database/types';

import { checkRecordVersion } from '../../common/helpers/check-record-version';
import { DatabaseService } from '../../database/database.service';
import { MediaService } from '../../media/services/media.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { throwCatalogWriteError } from '../helpers/catalog-write-error';
import { createWithCatalogSlug } from '../helpers/create-catalog-slug';
import type { GetCatalogEntityOptions } from '../interfaces/get-catalog-entity-options.interface';
import { toTeacher } from '../mappers/catalog.mapper';
import { TeachersRepository } from '../repositories/teachers.repository';
import { TeacherSubjectsService } from './teacher-subjects.service';
@Injectable()
export class TeachersService {
  constructor(
    private readonly repository: TeachersRepository,
    private readonly database: DatabaseService,
    private readonly permissions: PermissionsService,
    private readonly assignments: TeacherSubjectsService,
    private readonly media: MediaService,
  ) {}
  async getByIdOrThrow(
    id: string,
    options: GetCatalogEntityOptions = {},
  ): Promise<Teacher> {
    if (options.lock && !options.transaction)
      throw new TypeError('A transaction is required for row locking');
    const row =
      options.lock === 'update'
        ? await this.repository.findByIdForUpdate(id, options.transaction!)
        : await this.repository.findById(id, options.transaction);
    if (!row) throw new NotFoundException('Teacher not found');
    return row;
  }
  async get(id: string) {
    return toTeacher(await this.getByIdOrThrow(id));
  }
  async getPublished(slug: string) {
    const row = await this.repository.findPublishedBySlug(slug);
    if (!row) throw new NotFoundException('Teacher not found');
    return toTeacher(row);
  }
  async list(limit: number, offset: number, published = false) {
    const rows = await this.repository.list(limit + 1, offset, published);
    return {
      items: rows.slice(0, limit).map(toTeacher),
      hasMore: rows.length > limit,
    };
  }
  async create(data: CreateTeacherRequest) {
    try {
      return await createWithCatalogSlug(
        `${data.firstName} ${data.lastName}`,
        200,
        'teachers_slug_unique',
        (slug) =>
          this.database.db.transaction(async (tx) => {
            if (data.photoId)
              await this.media.prepareImageReplacement(null, data.photoId, tx);
            return toTeacher(
              await this.repository.create({ ...data, slug }, tx),
            );
          }),
      );
    } catch (error) {
      throwCatalogWriteError(error);
    }
  }
  private validatePublication(value: Teacher) {
    if (
      value.status === 'PUBLISHED' &&
      (!value.photoId?.trim() ||
        !value.shortDescription?.trim() ||
        !value.biography?.trim())
    )
      throw new BadRequestException(
        'Attach a photo and add a short description and biography before publishing',
      );
  }
  private async write(
    id: string,
    data: UpdateTeacherRequest & { status?: PublicationStatus },
    actor: AuthUser,
  ) {
    const { expectedVersion, ...changes } = data;
    if (!Object.keys(changes).length)
      throw new BadRequestException('No fields to update');
    try {
      return await this.database.db.transaction(async (tx) => {
        const current = await this.getByIdOrThrow(id, {
          transaction: tx,
          lock: 'update',
        });
        checkRecordVersion(current.version, expectedVersion);
        if (changes.photoId !== undefined)
          await this.media.prepareImageReplacement(
            current.photoId,
            changes.photoId,
            tx,
          );
        if (current.status === 'PUBLISHED' || changes.status !== undefined) {
          await this.permissions.require(actor, ['teachers.publish'], tx);
        }
        this.validatePublication({ ...current, ...changes });
        const updated = await this.repository.update(
          id,
          { ...changes, version: current.version + 1 },
          tx,
        );
        if (!updated) throw new NotFoundException('Teacher not found');
        return toTeacher(updated);
      });
    } catch (error) {
      throwCatalogWriteError(error);
    }
  }
  update(id: string, data: UpdateTeacherRequest, actor: AuthUser) {
    return this.write(id, data, actor);
  }
  setStatus(
    id: string,
    status: PublicationStatus,
    expectedVersion: number,
    actor: AuthUser,
  ) {
    return this.write(id, { status, expectedVersion }, actor);
  }
  async delete(id: string, expectedVersion: number) {
    await this.database.db.transaction(async (tx) => {
      const teacher = await this.getByIdOrThrow(id, {
        transaction: tx,
        lock: 'update',
      });
      checkRecordVersion(teacher.version, expectedVersion);
      await this.media.prepareImageReplacement(teacher.photoId, null, tx);
      await this.repository.delete(id, tx);
    });
    return { message: 'Teacher deleted' };
  }

  async getPublishedPhoto(slug: string) {
    const teacher = await this.getPublished(slug);
    if (!teacher.photoId) throw new NotFoundException('Photo not found');
    return this.media.read(teacher.photoId);
  }

  async getSubjects(id: string) {
    return this.database.db.transaction(async (tx) => {
      const teacher = await this.getByIdOrThrow(id, {
        transaction: tx,
        lock: 'update',
      });
      return {
        items: await this.assignments.list(id, tx),
        version: teacher.version,
      };
    });
  }
  async setSubjects(
    id: string,
    subjects: TeacherSubjectAssignment[],
    expectedVersion: number,
    actor: AuthUser,
  ) {
    try {
      return await this.database.db.transaction(async (tx) => {
        const subjectsExist = await this.assignments.lockSubjects(subjects, tx);
        const teacher = await this.getByIdOrThrow(id, {
          transaction: tx,
          lock: 'update',
        });
        if (teacher.status === 'PUBLISHED')
          await this.permissions.require(actor, ['teachers.publish'], tx);
        checkRecordVersion(teacher.version, expectedVersion);
        // Check the teacher revision first so a deleted assignment produces the
        // same reviewable conflict as any other change to the assignment list.
        if (!subjectsExist)
          throw new NotFoundException('Referenced subject does not exist');
        const items = await this.assignments.replace(id, subjects, tx);
        const version = teacher.version + 1;
        await this.repository.update(id, { version }, tx);
        return { items, version };
      });
    } catch (error) {
      throwCatalogWriteError(error);
    }
  }
  async listForSubject(subjectId: string, limit: number, offset: number) {
    const rows = await this.assignments.publishedTeachers(
      subjectId,
      limit + 1,
      offset,
    );
    return {
      items: rows.slice(0, limit).map(toTeacher),
      hasMore: rows.length > limit,
    };
  }
}
