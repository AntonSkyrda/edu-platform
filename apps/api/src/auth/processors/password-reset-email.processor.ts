import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { EnvironmentService } from '../../config/environment.service';
import { EmailService } from '../../infrastructure/email/email.service';
import {
  passwordChangedTemplate,
  passwordResetTemplate,
} from '../../infrastructure/email/templates/password-reset.template';
import { loggingContext } from '../../infrastructure/logger/logging-context';
import type { PasswordResetEmailJob } from '../interfaces/password-reset-email-job.interface';
import { PasswordResetsService } from '../services/password-resets.service';

@Injectable()
export class PasswordResetEmailProcessor {
  private readonly logger = new Logger(PasswordResetEmailProcessor.name);
  constructor(
    private readonly resets: PasswordResetsService,
    private readonly email: EmailService,
    private readonly environment: EnvironmentService,
  ) {}
  process(job: Job<PasswordResetEmailJob>): Promise<void> {
    return loggingContext.run(
      { requestId: job.data.requestId ?? randomUUID(), jobId: job.id },
      () => this.send(job),
    );
  }
  private async send(job: Job<PasswordResetEmailJob>): Promise<void> {
    const notification = job.name === 'password-changed';
    if (!notification && job.name !== 'password-reset')
      throw new Error('Unsupported email job');
    const delivery = notification
      ? await this.resets.prepareNotification(job.data.resetId)
      : await this.resets.prepareDelivery(job.data.resetId);
    if (!delivery) return;
    const url = new URL('/reset-password', this.environment.frontendOrigin);
    if ('token' in delivery && typeof delivery.token === 'string')
      url.hash = new URLSearchParams({ token: delivery.token }).toString();
    try {
      await this.email.send({
        to: delivery.user.email,
        ...(notification
          ? passwordChangedTemplate(delivery.user.firstName)
          : passwordResetTemplate({
              firstName: delivery.user.firstName,
              resetUrl: url.toString(),
              expiresAt: delivery.reset.expiresAt,
            })),
      });
      if (notification)
        await this.resets.recordNotification(job.data.resetId, 'sent');
      else {
        await this.resets.recordDeliveryAttempt(job.data.resetId);
        await this.resets.recordDelivery(job.data.resetId, 'sent');
      }
      this.logger.log({
        event: 'password_reset.smtp_accepted',
        resetId: job.data.resetId,
        jobName: job.name,
      });
    } catch (error: unknown) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[A-Z0-9_]{1,40}$/.test(error.code)
          ? error.code
          : 'DELIVERY_ERROR';
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (notification)
        await this.resets.recordNotification(
          job.data.resetId,
          final ? 'failed' : 'pending',
          code,
        );
      else {
        await this.resets.recordDeliveryAttempt(job.data.resetId, code);
        if (final)
          await this.resets.recordDelivery(job.data.resetId, 'failed', code);
      }
      if (final)
        this.logger.error({
          event: 'password_reset.delivery_failed',
          resetId: job.data.resetId,
          jobName: job.name,
          errorCode: code,
        });
      throw new Error(code);
    }
  }
}
