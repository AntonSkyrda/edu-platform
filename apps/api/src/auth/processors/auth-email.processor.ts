import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { LifecycleService } from '../../infrastructure/lifecycle/lifecycle.service';
import { QueueName } from '../../infrastructure/queue/queue.constants';
import type { InvitationEmailJob } from '../interfaces/invitation-email-job.interface';
import type { PasswordResetEmailJob } from '../interfaces/password-reset-email-job.interface';
import { DeliveryMonitorService } from '../services/delivery-monitor.service';
import { InvitationEmailProcessor } from './invitation-email.processor';
import { PasswordResetEmailProcessor } from './password-reset-email.processor';

@Processor(QueueName.EMAIL)
export class AuthEmailProcessor extends WorkerHost {
  constructor(
    private readonly invitations: InvitationEmailProcessor,
    private readonly resets: PasswordResetEmailProcessor,
    private readonly lifecycle: LifecycleService,
    private readonly monitor: DeliveryMonitorService,
  ) {
    super();
  }
  onApplicationBootstrap() {
    this.lifecycle?.register('email-worker', async () => {
      await this.worker.close();
      await this.monitor?.stopWorker();
    });
  }
  process(job: Job<InvitationEmailJob | PasswordResetEmailJob>): Promise<void> {
    return this.monitor
      ? this.monitor.track(() => this.deliver(job))
      : this.deliver(job);
  }
  private deliver(
    job: Job<InvitationEmailJob | PasswordResetEmailJob>,
  ): Promise<void> {
    if (job.name === 'invitation')
      return this.invitations.process(job as Job<InvitationEmailJob>);
    if (job.name === 'password-reset' || job.name === 'password-changed')
      return this.resets.process(job as Job<PasswordResetEmailJob>);
    throw new Error('Unsupported email job');
  }
}
