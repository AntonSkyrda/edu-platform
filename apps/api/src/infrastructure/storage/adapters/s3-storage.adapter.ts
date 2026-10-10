import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';

import { EnvironmentService } from '../../../config/environment.service';
import { validateObjectKey } from '../helpers/validate-object-key';
import type { StorageAdapter } from '../interfaces/storage-adapter.interface';
@Injectable()
export class S3StorageAdapter implements StorageAdapter, OnModuleDestroy {
  private client?: S3Client;
  constructor(private readonly environment: EnvironmentService) {}
  private getClient() {
    return (this.client ??= new S3Client({
      region: this.environment.s3Region,
      endpoint: this.environment.s3Endpoint,
      forcePathStyle: this.environment.s3ForcePathStyle,
      credentials: this.environment.s3AccessKeyId
        ? {
            accessKeyId: this.environment.s3AccessKeyId,
            secretAccessKey: this.environment.s3SecretAccessKey,
          }
        : undefined,
    }));
  }
  async put(key: string, body: Buffer, mimeType: string) {
    validateObjectKey(key);
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.environment.s3Bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        CacheControl: 'private, no-store',
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
  }
  async read(key: string) {
    validateObjectKey(key);
    const result = await this.getClient().send(
      new GetObjectCommand({ Bucket: this.environment.s3Bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
    if (!(result.Body instanceof Readable))
      throw new Error('Storage returned no stream');
    return result.Body;
  }
  async delete(key: string) {
    validateObjectKey(key);
    await this.getClient().send(
      new DeleteObjectCommand({ Bucket: this.environment.s3Bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
  }
  onModuleDestroy() {
    this.client?.destroy();
  }
}
