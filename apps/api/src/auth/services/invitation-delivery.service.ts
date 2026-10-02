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
import { InvitationsService } from './invitations.service';

@Injectable()
export class InvitationDeliveryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InvitationDeliveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private recovery?: Promise<void>;
  constructor(
    private readonly invitations: InvitationsService,
    private readonly queue: QueueService,
    private readonly environment: EnvironmentService,
  ) {}

  async enqueue(invitationId: string): Promise<void> {
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
    } catch {
      this.logger.warn({
        event: 'invitation.enqueue_failed',
        invitationId,
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
      for (const invitation of await this.invitations.pendingDeliveries())
        await this.enqueue(invitation.id);
    } catch {
      this.logger.error({ event: 'invitation.recovery_failed' });
    }
  }
  onApplicationBootstrap(): void {
    void this.recover();
    this.timer = setInterval(() => {
      void this.recover();
    }, this.environment.invitationDeliveryPollMs);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.recovery;
  }
}
