import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AuthUser,
  CreateSubjectRequest,
  PublicationStatus,
  UpdateSubjectRequest,
} from '@project/contracts';
import type { Subject } from '@project/database/types';

import { checkRecordVersion } from '../../common/helpers/check-record-version';
import { DatabaseService } from '../../database/database.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { throwCatalogWriteError } from '../helpers/catalog-write-error';
import { createWithCatalogSlug } from '../helpers/create-catalog-slug';
import type { GetCatalogEntityOptions } from '../interfaces/get-catalog-entity-options.interface';
import { toSubject } from '../mappers/catalog.mapper';
import { SubjectsRepository } from '../repositories/subjects.repository';
import { TeacherSubjectsService } from './teacher-subjects.service';

@Injectable()
export class SubjectsService {
  constructor(
    private readonly repository: SubjectsRepository,
    private readonly database: DatabaseService,
    private readonly permissions: PermissionsService,
    private readonly assignments: TeacherSubjectsService,
  ) {}
  async getByIdOrThrow(
    id: string,
    options: GetCatalogEntityOptions = {},
  ): Promise<Subject> {
    if (options.lock && !options.transaction)
      throw new TypeError('A transaction is required for row locking');
    const row =
      options.lock === 'update'
        ? await this.repository.findByIdForUpdate(id, options.transaction!)
        : await this.repository.findById(id, options.transaction);
    if (!row) throw new NotFoundException('Subject not found');
    return row;
  }
  async get(id: string) {
    return toSubject(await this.getByIdOrThrow(id));
  }
  async getPublished(slug: string) {
    const row = await this.repository.findPublishedBySlug(slug);
    if (!row) throw new NotFoundException('Subject not found');
    return toSubject(row);
  }
  async list(limit: number, offset: number, published = false) {
    const rows = await this.repository.list(limit + 1, offset, published);
    return {
      items: rows.slice(0, limit).map(toSubject),
      hasMore: rows.length > limit,
    };
  }
  async create(data: CreateSubjectRequest) {
    try {
      return toSubject(
        await createWithCatalogSlug(
          data.name,
          150,
          'subjects_slug_unique',
          (slug) => this.repository.create({ ...data, slug }),
        ),
      );
    } catch (error) {
      throwCatalogWriteError(error);
    }
  }
  private async write(
    id: string,
    data: UpdateSubjectRequest & { status?: PublicationStatus },
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
        if (current.status === 'PUBLISHED' || changes.status !== undefined) {
          await this.permissions.require(actor, ['subjects.publish'], tx);
        }
        checkRecordVersion(current.version, expectedVersion);
        const updated = await this.repository.update(
          id,
          { ...changes, version: current.version + 1 },
          tx,
        );
        if (!updated) throw new NotFoundException('Subject not found');
        return toSubject(updated);
      });
    } catch (error) {
      throwCatalogWriteError(error);
    }
  }
  update(id: string, data: UpdateSubjectRequest, actor: AuthUser) {
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
      const current = await this.getByIdOrThrow(id, {
        transaction: tx,
        lock: 'update',
      });
      checkRecordVersion(current.version, expectedVersion);
      await this.assignments.prepareSubjectDeletion(id, tx);
      await this.repository.delete(id, tx);
    });
    return { message: 'Subject deleted' };
  }
}
