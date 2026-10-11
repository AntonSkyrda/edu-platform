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

import { DatabaseService } from '../../database/database.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { throwCatalogWriteError } from '../helpers/catalog-write-error';
import { createWithCatalogSlug } from '../helpers/create-catalog-slug';
import type { GetCatalogEntityOptions } from '../interfaces/get-catalog-entity-options.interface';
import { toSubject } from '../mappers/catalog.mapper';
import { SubjectsRepository } from '../repositories/subjects.repository';

@Injectable()
export class SubjectsService {
  constructor(
    private readonly repository: SubjectsRepository,
    private readonly database: DatabaseService,
    private readonly permissions: PermissionsService,
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
    if (!Object.keys(data).length)
      throw new BadRequestException('No fields to update');
    try {
      return await this.database.db.transaction(async (tx) => {
        const current = await this.getByIdOrThrow(id, {
          transaction: tx,
          lock: 'update',
        });
        if (current.status === 'PUBLISHED' || data.status !== undefined) {
          await this.permissions.require(actor, ['subjects.publish'], tx);
        }
        const updated = await this.repository.update(id, data, tx);
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
  setStatus(id: string, status: PublicationStatus, actor: AuthUser) {
    return this.write(id, { status }, actor);
  }
  async delete(id: string) {
    if (!(await this.repository.delete(id)))
      throw new NotFoundException('Subject not found');
    return { message: 'Subject deleted' };
  }
}
