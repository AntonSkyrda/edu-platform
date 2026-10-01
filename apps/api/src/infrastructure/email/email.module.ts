import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { EnvironmentModule } from '../../config/environment.module';
import { QueueName } from '../queue/queue.constants';
import { EmailService } from './email.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.EMAIL }),
    EnvironmentModule,
  ],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
