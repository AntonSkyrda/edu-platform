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
import { InvitationsService } from './invitations.service';

@Injectable()
export class InvitationDeliveryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InvitationDeliveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private recovery?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly invitations: InvitationsService,
    private readonly queue: QueueService,
    private readonly environment: EnvironmentService,
    private readonly lifecycle: LifecycleService,
  ) {}

  async enqueue(invitationId: string): Promise<boolean> {
    try {
      await this.queue.enqueue(
        QueueName.EMAIL,
        'invitation',
        {
          invitationId,
          requestId: loggingContext.getStore()?.requestId ?? randomUUID(),
        },
        { jobId: invitationId },
      );
      return true;
    } catch {
      this.logger.warn({
        event: 'invitation.enqueue_failed',
        invitationId,
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
      for (let count = 0; count < 100 && !this.stopped; count++) {
        const claim = await this.invitations.claimDelivery(
          this.environment.mailDispatchLeaseMs,
        );
        if (!claim) return;
        if (this.stopped) return; // The reservation expires after a crash/shutdown.
        const sent = await this.enqueue(claim.id);
        await this.invitations.finishDispatch(
          claim,
          sent,
          this.environment.invitationDeliveryPollMs,
        );
        if (!sent) return;
      }
    } catch {
      this.logger.error({ event: 'invitation.recovery_failed' });
    }
  }
  onApplicationBootstrap(): void {
    this.lifecycle?.register('invitation-dispatcher', () =>
      this.onModuleDestroy(),
    );
    void this.recover();
    this.timer = setInterval(() => {
      void this.recover();
    }, this.environment.invitationDeliveryPollMs);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.recovery;
  }
}
