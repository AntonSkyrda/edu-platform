import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { EnvironmentModule } from '../../config/environment.module';
import { EnvironmentService } from '../../config/environment.service';
import { QueueName } from './queue.constants';
import { QueueService } from './queue.service';

@Module({
  imports: [
    EnvironmentModule,
    BullModule.forRootAsync({
      imports: [EnvironmentModule],
      inject: [EnvironmentService],
      useFactory: (environmentService: EnvironmentService) => ({
        connection: {
          host: environmentService.redisHost,
          port: environmentService.redisPort,
        },
      }),
    }),
    BullModule.registerQueue({
      name: QueueName.EMAIL,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
