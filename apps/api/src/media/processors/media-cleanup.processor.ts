import { Processor, WorkerHost } from '@nestjs/bullmq';

import { LifecycleService } from '../../infrastructure/lifecycle/lifecycle.service';
import { QueueName } from '../../infrastructure/queue/queue.constants';
import { MediaCleanupService } from '../services/media-cleanup.service';
@Processor(QueueName.MEDIA)
export class MediaCleanupProcessor extends WorkerHost {
  constructor(
    private readonly cleanup: MediaCleanupService,
    private readonly lifecycle: LifecycleService,
  ) {
    super();
  }
  onApplicationBootstrap() {
    this.lifecycle?.register('media-worker', () => this.worker.close());
  }
  async process() {
    await this.cleanup.run();
  }
}
