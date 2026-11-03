import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { EnvironmentService } from '../../config/environment.service';
import { LifecycleService } from '../../infrastructure/lifecycle/lifecycle.service';
import { QueueName } from '../../infrastructure/queue/queue.constants';
import { QueueService } from '../../infrastructure/queue/queue.service';

@Injectable()
export class MediaCleanupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaCleanupScheduler.name);
  private retry?: ReturnType<typeof setTimeout>;
  private scheduling?: Promise<void>;
  private stopped = false;

  constructor(
    private readonly queue: QueueService,
    private readonly environment: EnvironmentService,
    private readonly lifecycle: LifecycleService,
  ) {}

  private async schedule(): Promise<void> {
    try {
      await this.queue.schedule(
        QueueName.MEDIA,
        'cleanup',
        this.environment.mediaCleanupIntervalMs,
      );
    } catch {
      this.logger.error({ event: 'media.cleanup_schedule_failed' });
      // A failed producer no longer buffers commands offline. Retry registration
      // in the background so an outage at startup cannot disable cleanup forever.
      if (!this.stopped) {
        this.retry = setTimeout(() => {
          this.scheduling = this.schedule();
        }, 5000);
        this.retry.unref();
      }
    }
  }

  onModuleInit(): void {
    this.lifecycle?.register('media-scheduler', () => this.onModuleDestroy());
    this.scheduling = this.schedule();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    await this.scheduling;
  }
}
