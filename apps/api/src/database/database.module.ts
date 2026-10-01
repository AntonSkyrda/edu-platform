import { Module } from '@nestjs/common';

import { EnvironmentModule } from '../config/environment.module';
import { DatabaseService } from './database.service';

@Module({
  imports: [EnvironmentModule],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
