import { Injectable } from '@nestjs/common';
import {
  asc,
  BaseRepository,
  eq,
  lt,
  type Transaction,
} from '@project/database';
import { media } from '@project/database/schema';

import { DatabaseService } from '../../database/database.service';
@Injectable()
export class MediaRepository extends BaseRepository<typeof media> {
  constructor(database: DatabaseService) {
    super(database.db, media);
  }
  async findByIdForUpdate(id: string, tx: Transaction) {
    const [row] = await tx
      .select()
      .from(media)
      .where(eq(media.id, id))
      .for('update');
    return row ?? null;
  }
  expiredIds(now: Date) {
    return this.database
      .select({ id: media.id })
      .from(media)
      .where(lt(media.expiresAt, now))
      .orderBy(asc(media.expiresAt), asc(media.id))
      .limit(100);
  }
}
