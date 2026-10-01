import { Module } from '@nestjs/common';

import { EnvironmentModule } from '../../config/environment.module';
import { EmailService } from './email.service';

@Module({
  imports: [EnvironmentModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
