import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { QueueName } from '../../infrastructure/queue/queue.constants';
import type { InvitationEmailJob } from '../interfaces/invitation-email-job.interface';
import type { PasswordResetEmailJob } from '../interfaces/password-reset-email-job.interface';
import { InvitationEmailProcessor } from './invitation-email.processor';
import { PasswordResetEmailProcessor } from './password-reset-email.processor';

@Processor(QueueName.EMAIL)
export class AuthEmailProcessor extends WorkerHost {
  constructor(
    private readonly invitations: InvitationEmailProcessor,
    private readonly resets: PasswordResetEmailProcessor,
  ) {
    super();
  }
  process(job: Job<InvitationEmailJob | PasswordResetEmailJob>): Promise<void> {
    if (job.name === 'invitation')
      return this.invitations.process(job as Job<InvitationEmailJob>);
    if (job.name === 'password-reset' || job.name === 'password-changed')
      return this.resets.process(job as Job<PasswordResetEmailJob>);
    throw new Error('Unsupported email job');
  }
}
