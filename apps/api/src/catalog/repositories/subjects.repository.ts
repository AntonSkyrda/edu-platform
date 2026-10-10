import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  BaseRepository,
  eq,
  type Transaction,
} from '@project/database';
import { subjects } from '@project/database/schema';
import type { Subject } from '@project/database/types';

import { DatabaseService } from '../../database/database.service';
@Injectable()
export class SubjectsRepository extends BaseRepository<typeof subjects> {
  constructor(database: DatabaseService) {
    super(database.db, subjects);
  }
  async list(limit: number, offset: number, published: boolean) {
    return this.database
      .select()
      .from(this.table)
      .where(published ? eq(this.table.status, 'PUBLISHED') : undefined)
      .orderBy(asc(this.table.sortOrder), asc(this.table.id))
      .limit(limit)
      .offset(offset);
  }
  async findPublishedBySlug(slug: string): Promise<Subject | null> {
    const [row] = await this.database
      .select()
      .from(this.table)
      .where(and(eq(this.table.slug, slug), eq(this.table.status, 'PUBLISHED')))
      .limit(1);
    return row ?? null;
  }
  async findByIdForUpdate(
    id: string,
    tx: Transaction,
  ): Promise<Subject | null> {
    const [row] = await tx
      .select()
      .from(this.table)
      .where(eq(this.table.id, id))
      .for('update');
    return row ?? null;
  }
}
