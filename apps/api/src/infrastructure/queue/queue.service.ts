import { getSharedConfigToken } from '@nestjs/bullmq';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { type JobsOptions, Queue } from 'bullmq';
import { Redis, type RedisOptions } from 'ioredis';

import { EnvironmentService } from '../../config/environment.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { QUEUE_JOB_OPTIONS, QueueName } from './queue.constants';

type Producer = { client: Redis; queue: Queue; discarded?: boolean };

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly producers = new Map<QueueName, Producer>();
  private stopped = false;

  constructor(
    @Inject(getSharedConfigToken())
    private readonly config: { prefix: string; connection: RedisOptions },
    private readonly environment: EnvironmentService,
    private readonly lifecycle: LifecycleService,
  ) {}

  private producer(name: QueueName): Producer {
    if (this.stopped) throw new Error('Queue producer stopped');
    const existing = this.producers.get(name);
    if (existing) return existing;
    const timeout = this.environment.redisQueueTimeoutMs;
    // Producers must fail promptly. Workers retain their independent, reconnecting
    // connections: command deadlines are unsuitable for their blocking reads.
    const client = new Redis({
      ...this.config.connection,
      lazyConnect: true,
      connectTimeout: timeout,
      commandTimeout: timeout,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      autoResendUnfulfilledCommands: false,
      retryStrategy: null,
    });
    client.on('error', () => undefined);
    const queue = new Queue(name, {
      prefix: this.config.prefix,
      connection: client,
      defaultJobOptions: QUEUE_JOB_OPTIONS[name],
    });
    queue.on('error', () => undefined);
    const producer = { client, queue };
    this.producers.set(name, producer);
    return producer;
  }

  private discard(name: QueueName, producer: Producer): void {
    if (producer.discarded) return;
    producer.discarded = true;
    if (this.producers.get(name) === producer) this.producers.delete(name);
    // A Promise.race alone leaves commands/socket buffers alive. Disconnect the
    // exact failed client; a late failure must not close its replacement.
    producer.client.disconnect();
    // Keep BullMQ's error listeners until initialization has settled, otherwise
    // a late initialization rejection can emit an unhandled error during close.
    void producer.queue
      .waitUntilReady()
      .catch(() => undefined)
      .then(() => producer.queue.close())
      .catch(() => undefined);
  }

  private async execute(
    name: QueueName,
    operation: (queue: Queue) => Promise<unknown>,
  ): Promise<void> {
    const producer = this.producer(name);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          await producer.queue.waitUntilReady();
          return operation(producer.queue);
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Queue operation timed out')),
            this.environment.redisQueueTimeoutMs,
          );
        }),
      ]);
    } catch (error) {
      this.discard(name, producer);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  schedule(queueName: QueueName, name: string, every: number): Promise<void> {
    return this.execute(queueName, (queue) =>
      queue.upsertJobScheduler(name, { every }, { name, data: {} }),
    );
  }

  enqueue<T extends object>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: JobsOptions,
  ): Promise<void> {
    return this.execute(queueName, (queue) =>
      queue.add(jobName, data, options),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.lifecycle?.drain();
    this.stopped = true;
    for (const [name, producer] of this.producers) this.discard(name, producer);
  }
}
