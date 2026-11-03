import { randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { EnvironmentService } from '../../config/environment.service';
import { LifecycleService } from '../../infrastructure/lifecycle/lifecycle.service';
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
  private stopped = false;
  constructor(
    private readonly resets: PasswordResetsService,
    private readonly queue: QueueService,
    private readonly environment: EnvironmentService,
    private readonly lifecycle: LifecycleService,
  ) {}

  async enqueue(
    resetId: string,
    name: 'password-reset' | 'password-changed' = 'password-reset',
  ): Promise<boolean> {
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
      return true;
    } catch {
      this.logger.warn({
        event: 'password_reset.enqueue_failed',
        resetId,
        deliveryStatus: 'pending',
      });
      return false;
    }
  }
  async recover(): Promise<void> {
    if (this.stopped) return;
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
      for (const kind of ['password-reset', 'password-changed'] as const) {
        for (let count = 0; count < 100 && !this.stopped; count++) {
          const claim = await this.resets.claimDelivery(
            this.environment.mailDispatchLeaseMs,
            kind,
          );
          if (!claim) break;
          if (this.stopped) return;
          const sent = await this.enqueue(claim.id, kind);
          await this.resets.finishDispatch(
            claim,
            sent,
            this.environment.passwordResetDeliveryPollMs,
            kind,
          );
          if (!sent) return;
        }
      }
    } catch {
      this.logger.error({ event: 'password_reset.recovery_failed' });
    }
  }
  onApplicationBootstrap(): void {
    this.lifecycle?.register('reset-dispatcher', () => this.onModuleDestroy());
    void this.recover();
    this.timer = setInterval(() => {
      void this.recover();
    }, this.environment.passwordResetDeliveryPollMs);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.recovery;
  }
}
