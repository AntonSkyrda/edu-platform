import { Injectable } from '@nestjs/common';

import { LocalStorageAdapter } from './adapters/local-storage.adapter';
import { S3StorageAdapter } from './adapters/s3-storage.adapter';
import type { StorageDriver } from './interfaces/storage-adapter.interface';
@Injectable()
export class StorageService {
  constructor(
    private readonly local: LocalStorageAdapter,
    private readonly s3: S3StorageAdapter,
  ) {}
  private adapter(driver: StorageDriver) {
    return driver === 'local' ? this.local : this.s3;
  }
  put(driver: StorageDriver, key: string, body: Buffer, mimeType: string) {
    return this.adapter(driver).put(key, body, mimeType);
  }
  read(driver: StorageDriver, key: string) {
    return this.adapter(driver).read(key);
  }
  delete(driver: StorageDriver, key: string) {
    return this.adapter(driver).delete(key);
  }
}
