import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Injectable } from '@nestjs/common';

import { EnvironmentService } from '../../../config/environment.service';
import { validateObjectKey } from '../helpers/validate-object-key';
import type { StorageAdapter } from '../interfaces/storage-adapter.interface';
@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly environment: EnvironmentService) {}
  private path(key: string) {
    validateObjectKey(key);
    return resolve(this.environment.storageLocalRoot, key);
  }
  async put(key: string, body: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, body, { flag: 'wx', mode: 0o600 });
  }
  async read(key: string) {
    const path = this.path(key);
    await stat(path);
    return createReadStream(path);
  }
  async delete(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
