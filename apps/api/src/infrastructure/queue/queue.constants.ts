import type { JobsOptions } from 'bullmq';

export enum QueueName {
  EMAIL = 'email',
  MEDIA = 'media',
}

export const QUEUE_JOB_OPTIONS: Record<QueueName, JobsOptions> = {
  [QueueName.EMAIL]: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: true,
  },
  [QueueName.MEDIA]: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  },
};
