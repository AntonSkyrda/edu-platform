import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { EnvironmentService } from '../../config/environment.service';
import { QueueName } from '../../infrastructure/queue/queue.constants';
import { QueueService } from '../../infrastructure/queue/queue.service';
@Injectable()
export class MediaCleanupScheduler implements OnModuleInit {
  private readonly logger = new Logger(MediaCleanupScheduler.name);
  constructor(
    private readonly queue: QueueService,
    private readonly environment: EnvironmentService,
  ) {}
  onModuleInit() {
    void this.queue
      .schedule(
        QueueName.MEDIA,
        'cleanup',
        this.environment.mediaCleanupIntervalMs,
      )
      .catch(() =>
        this.logger.error({ event: 'media.cleanup_schedule_failed' }),
      );
  }
}
