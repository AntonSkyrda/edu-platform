import { Injectable, Logger } from '@nestjs/common';
import type { Transaction } from '@project/database';

import type { StorageDriver } from '../../infrastructure/storage/interfaces/storage-adapter.interface';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MediaDeletionsRepository } from '../repositories/media-deletions.repository';
@Injectable()
export class MediaDeletionsService {
  private readonly logger = new Logger(MediaDeletionsService.name);
  constructor(
    private readonly repository: MediaDeletionsRepository,
    private readonly storage: StorageService,
  ) {}
  enqueue(objectKey: string, storageDriver: StorageDriver, tx: Transaction) {
    return this.repository.create({ objectKey, storageDriver }, tx);
  }
  async flush() {
    for (const record of await this.repository.due(new Date())) {
      try {
        await this.storage.delete(record.storageDriver, record.objectKey);
        await this.repository.delete(record.id);
      } catch {
        await this.repository.update(record.id, {
          nextAttemptAt: new Date(Date.now() + 60000),
        });
        this.logger.warn({
          event: 'media.storage_delete_failed',
          deletionId: record.id,
        });
      }
    }
  }
}
