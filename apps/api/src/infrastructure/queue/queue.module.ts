import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { EnvironmentModule } from '../../config/environment.module';
import { EnvironmentService } from '../../config/environment.service';

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
  ],
})
export class QueueModule {}
