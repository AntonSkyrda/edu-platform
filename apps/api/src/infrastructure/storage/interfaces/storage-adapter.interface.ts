import type { Readable } from 'node:stream';
export type StorageDriver = 'local' | 's3';
export interface StorageAdapter {
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
