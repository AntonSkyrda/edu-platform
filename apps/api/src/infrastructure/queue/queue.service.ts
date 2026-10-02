import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { type JobsOptions, Queue } from 'bullmq';

import { QueueName } from './queue.constants';

@Injectable()
export class QueueService {
  private readonly queues: Record<QueueName, Queue>;

  constructor(@InjectQueue(QueueName.EMAIL) emailQueue: Queue) {
    this.queues = { [QueueName.EMAIL]: emailQueue };
  }

  async enqueue<T extends object>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: JobsOptions,
  ): Promise<void> {
    await this.queues[queueName].add(jobName, data, options);
  }
}
