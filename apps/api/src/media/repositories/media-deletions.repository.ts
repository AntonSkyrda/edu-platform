import { Injectable } from '@nestjs/common';
import { asc, BaseRepository, lt } from '@project/database';
import { mediaDeletions } from '@project/database/schema';

import { DatabaseService } from '../../database/database.service';
@Injectable()
export class MediaDeletionsRepository extends BaseRepository<
  typeof mediaDeletions
> {
  constructor(database: DatabaseService) {
    super(database.db, mediaDeletions);
  }
  due(now: Date) {
    return this.database
      .select()
      .from(mediaDeletions)
      .where(lt(mediaDeletions.nextAttemptAt, now))
      .orderBy(asc(mediaDeletions.nextAttemptAt), asc(mediaDeletions.id))
      .limit(100);
  }
}
