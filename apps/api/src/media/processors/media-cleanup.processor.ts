import { Processor, WorkerHost } from '@nestjs/bullmq';

import { QueueName } from '../../infrastructure/queue/queue.constants';
import { MediaCleanupService } from '../services/media-cleanup.service';
@Processor(QueueName.MEDIA)
export class MediaCleanupProcessor extends WorkerHost {
  constructor(private readonly cleanup: MediaCleanupService) {
    super();
  }
  async process() {
    await this.cleanup.run();
  }
}
