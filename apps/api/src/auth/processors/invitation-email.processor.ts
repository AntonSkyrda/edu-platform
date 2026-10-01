import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { EnvironmentService } from '../../config/environment.service';
import { EmailService } from '../../infrastructure/email/email.service';
import { invitationTemplate } from '../../infrastructure/email/templates/invitation.template';
import { QueueName } from '../../infrastructure/queue/queue.constants';
import type { InvitationEmailJob } from '../interfaces/invitation-email-job.interface';
import { InvitationsService } from '../services/invitations.service';

@Processor(QueueName.EMAIL)
export class InvitationEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(InvitationEmailProcessor.name);
  constructor(
    private readonly invitations: InvitationsService,
    private readonly email: EmailService,
    private readonly environment: EnvironmentService,
  ) {
    super();
  }
  async process(job: Job<InvitationEmailJob>): Promise<void> {
    if (job.name !== 'invitation') throw new Error('Unsupported email job');
    const delivery = await this.invitations.prepareDelivery(
      job.data.invitationId,
    );
    if (!delivery) return;
    const { user, token } = delivery;
    const url = new URL('/accept-invitation', this.environment.frontendOrigin);
    url.hash = new URLSearchParams({ token }).toString();
    try {
      await this.email.send({
        to: user.email,
        ...invitationTemplate({
          firstName: user.firstName,
          invitationUrl: url.toString(),
          validForHours: this.environment.invitationTtlMs / 3600000,
        }),
      });
      await this.invitations.recordDeliveryAttempt(job.data.invitationId);
      await this.invitations.recordDelivery(job.data.invitationId, 'sent');
      this.logger.log(`Invitation ${job.data.invitationId}: accepted by SMTP`);
    } catch (error: unknown) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[A-Z0-9_]{1,40}$/.test(error.code)
          ? error.code
          : 'DELIVERY_ERROR';
      await this.invitations.recordDeliveryAttempt(job.data.invitationId, code);
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.invitations.recordDelivery(
          job.data.invitationId,
          'failed',
          code,
        );
        this.logger.error(
          `Invitation ${job.data.invitationId}: delivery failed (${code})`,
        );
      }
      throw new Error(code);
    }
  }
}
