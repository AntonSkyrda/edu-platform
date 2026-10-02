import { randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { EnvironmentService } from '../../config/environment.service';
import { loggingContext } from '../../infrastructure/logger/logging-context';
import { QueueName } from '../../infrastructure/queue/queue.constants';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { PasswordResetsService } from './password-resets.service';

@Injectable()
export class PasswordResetDeliveryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PasswordResetDeliveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private recovery?: Promise<void>;
  constructor(
    private readonly resets: PasswordResetsService,
    private readonly queue: QueueService,
    private readonly environment: EnvironmentService,
  ) {}

  async enqueue(
    resetId: string,
    name: 'password-reset' | 'password-changed' = 'password-reset',
  ): Promise<void> {
    try {
      await this.queue.enqueue(
        QueueName.EMAIL,
        name,
        {
          resetId,
          requestId: loggingContext.getStore()?.requestId ?? randomUUID(),
        },
        { jobId: `${name}-${resetId}` },
      );
    } catch {
      this.logger.warn({
        event: 'password_reset.enqueue_failed',
        resetId,
        deliveryStatus: 'pending',
      });
    }
  }
  async recover(): Promise<void> {
    if (this.recovery) return this.recovery;
    this.recovery = this.dispatchPending();
    try {
      await this.recovery;
    } finally {
      this.recovery = undefined;
    }
  }
  private async dispatchPending(): Promise<void> {
    try {
      for (const reset of await this.resets.pendingDeliveries())
        await this.enqueue(reset.id);
      for (const reset of await this.resets.pendingNotifications())
        await this.enqueue(reset.id, 'password-changed');
    } catch {
      this.logger.error({ event: 'password_reset.recovery_failed' });
    }
  }
  onApplicationBootstrap(): void {
    void this.recover();
    this.timer = setInterval(() => {
      void this.recover();
    }, this.environment.passwordResetDeliveryPollMs);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.recovery;
  }
}
