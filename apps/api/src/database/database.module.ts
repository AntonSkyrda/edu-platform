import { Module } from '@nestjs/common';

import { EnvironmentModule } from '../config/environment.module';
import { LifecycleModule } from '../infrastructure/lifecycle/lifecycle.module';
import { DatabaseService } from './database.service';

@Module({
  imports: [EnvironmentModule, LifecycleModule],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
