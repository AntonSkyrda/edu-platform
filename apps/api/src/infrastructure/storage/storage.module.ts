import { Module } from '@nestjs/common';

import { EnvironmentModule } from '../../config/environment.module';
import { LocalStorageAdapter } from './adapters/local-storage.adapter';
import { S3StorageAdapter } from './adapters/s3-storage.adapter';
import { StorageService } from './storage.service';
@Module({
  imports: [EnvironmentModule],
  providers: [LocalStorageAdapter, S3StorageAdapter, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
