import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { type JobsOptions, Queue } from 'bullmq';

import { QueueName } from './queue.constants';

@Injectable()
export class QueueService {
  private readonly queues: Record<QueueName, Queue>;

  constructor(
    @InjectQueue(QueueName.EMAIL) emailQueue: Queue,
    @InjectQueue(QueueName.MEDIA) mediaQueue: Queue,
  ) {
    this.queues = {
      [QueueName.EMAIL]: emailQueue,
      [QueueName.MEDIA]: mediaQueue,
    };
  }

  async schedule(
    queueName: QueueName,
    name: string,
    every: number,
  ): Promise<void> {
    await this.queues[queueName].upsertJobScheduler(
      name,
      { every },
      { name, data: {} },
    );
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
