import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { EnvironmentModule } from '../../config/environment.module';
import { EnvironmentService } from '../../config/environment.service';
import { LifecycleModule } from '../lifecycle/lifecycle.module';
import { QUEUE_JOB_OPTIONS, QueueName } from './queue.constants';
import { QueueService } from './queue.service';

@Module({
  imports: [
    EnvironmentModule,
    LifecycleModule,
    BullModule.forRootAsync({
      imports: [EnvironmentModule],
      inject: [EnvironmentService],
      useFactory: (environmentService: EnvironmentService) => ({
        prefix: environmentService.redisQueuePrefix,
        connection: {
          host: environmentService.redisHost,
          port: environmentService.redisPort,
        },
      }),
    }),
    BullModule.registerQueue({
      name: QueueName.MEDIA,
      defaultJobOptions: QUEUE_JOB_OPTIONS[QueueName.MEDIA],
    }),
    BullModule.registerQueue({
      name: QueueName.EMAIL,
      defaultJobOptions: QUEUE_JOB_OPTIONS[QueueName.EMAIL],
    }),
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
