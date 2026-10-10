import { Injectable } from '@nestjs/common';

import { MediaDeletionsService } from './media-deletions.service';
import { MediaService } from './media.service';
@Injectable()
export class MediaCleanupService {
  constructor(
    private readonly media: MediaService,
    private readonly deletions: MediaDeletionsService,
  ) {}
  async run() {
    await this.media.removeExpired();
    await this.deletions.flush();
  }
}
