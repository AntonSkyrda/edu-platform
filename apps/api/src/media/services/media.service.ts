import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { MediaKind } from '@project/contracts';
import type { Transaction } from '@project/database';

import { EnvironmentService } from '../../config/environment.service';
import { DatabaseService } from '../../database/database.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { toMedia } from '../mappers/media.mapper';
import { ImageProcessor } from '../processors/image.processor';
import { PdfProcessor } from '../processors/pdf.processor';
import { MediaRepository } from '../repositories/media.repository';
import { MediaDeletionsService } from './media-deletions.service';
@Injectable()
export class MediaService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly database: DatabaseService,
    private readonly environment: EnvironmentService,
    private readonly storage: StorageService,
    private readonly images: ImageProcessor,
    private readonly pdfs: PdfProcessor,
    private readonly deletions: MediaDeletionsService,
  ) {}
  private expiry() {
    return new Date(Date.now() + this.environment.mediaOrphanTtlMs);
  }
  async upload(body: Buffer | undefined, kind: MediaKind) {
    if (!body?.length)
      throw new BadRequestException('A nonempty file field is required');
    const processed = await (
      kind === 'IMAGE' ? this.images : this.pdfs
    ).process(body);
    const objectKey = `${kind === 'IMAGE' ? 'images' : 'documents'}/${randomUUID()}.${processed.extension}`;
    const record = await this.repository.create({
      kind,
      objectKey,
      mimeType: processed.mimeType,
      size: processed.body.length,
      width: processed.width,
      height: processed.height,
      pageCount: processed.pageCount,
      storageDriver: this.environment.storageDriver,
      expiresAt: this.expiry(),
    });
    try {
      await this.storage.put(
        record.storageDriver,
        objectKey,
        processed.body,
        processed.mimeType,
      );
      const ready = await this.repository.update(record.id, { state: 'READY' });
      if (!ready) throw new Error('Upload record missing');
      return toMedia(ready);
    } catch {
      throw new ServiceUnavailableException(
        'File could not be stored. Please retry.',
      );
    }
  }
  async getReady(id: string) {
    const record = await this.repository.findById(id);
    if (!record || record.state !== 'READY')
      throw new NotFoundException('File not found');
    return record;
  }
  async get(id: string) {
    return toMedia(await this.getReady(id));
  }
  async read(id: string) {
    const record = await this.getReady(id);
    try {
      return {
        stream: await this.storage.read(record.storageDriver, record.objectKey),
        mimeType: record.mimeType,
        size: record.size,
        disposition: `${record.kind === 'PDF' ? 'attachment' : 'inline'}; filename="${record.id}.${record.kind === 'PDF' ? 'pdf' : 'webp'}"`,
      };
    } catch {
      throw new ServiceUnavailableException('File is temporarily unavailable');
    }
  }
  async prepareImageReplacement(
    previousId: string | null,
    nextId: string | null,
    tx: Transaction,
  ) {
    for (const id of [
      ...new Set(
        [previousId, nextId].filter((id): id is string => Boolean(id)),
      ),
    ].sort()) {
      const record = await this.repository.findByIdForUpdate(id, tx);
      if (!record) throw new NotFoundException('File not found');
      if (
        id === nextId &&
        (record.state !== 'READY' || record.kind !== 'IMAGE')
      )
        throw new BadRequestException('Attachment must be a ready image');
      await this.repository.update(
        id,
        { expiresAt: id === nextId ? null : this.expiry() },
        tx,
      );
    }
  }
  async remove(id: string, expiredOnly = false) {
    try {
      await this.database.db.transaction(async (tx) => {
        const record = await this.repository.findByIdForUpdate(id, tx);
        if (!record) {
          if (expiredOnly) return;
          throw new NotFoundException('File not found');
        }
        if (
          expiredOnly &&
          (!record.expiresAt || record.expiresAt.getTime() > Date.now())
        )
          return;
        await this.repository.delete(id, tx);
        await this.deletions.enqueue(
          record.objectKey,
          record.storageDriver,
          tx,
        );
      });
    } catch (error) {
      const code =
        (error as { cause?: { code?: string }; code?: string })?.cause?.code ??
        (error as { code?: string })?.code;
      if (code === '23503' || code === '23001') {
        if (expiredOnly) {
          await this.repository.update(id, { expiresAt: this.expiry() });
          return;
        }
        throw new ConflictException('File is still attached to content');
      }
      if (code === '40P01' || code === '40001')
        throw new ConflictException('Concurrent file update; please retry');
      throw error;
    }
    return { message: 'File deletion scheduled' };
  }
  async removeExpired() {
    for (const record of await this.repository.expiredIds(new Date()))
      await this.remove(record.id, true);
  }
}
