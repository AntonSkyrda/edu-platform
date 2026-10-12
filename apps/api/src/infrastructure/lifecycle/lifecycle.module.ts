import { Global, Module } from '@nestjs/common';

import { EnvironmentModule } from '../../config/environment.module';
import { LifecycleService } from './lifecycle.service';

@Global()
@Module({
  imports: [EnvironmentModule],
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
