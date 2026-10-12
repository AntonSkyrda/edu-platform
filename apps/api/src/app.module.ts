import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { EnvironmentModule } from './config/environment.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { EmailModule } from './infrastructure/email/email.module';
import { LoggerModule } from './infrastructure/logger/logger.module';
import { QueueModule } from './infrastructure/queue/queue.module';

@Module({
  imports: [
    LoggerModule,
    HealthModule,
    CatalogModule,
    AuthModule,
    EnvironmentModule,
    DatabaseModule,
    QueueModule,
    EmailModule,
  ],
})
export class AppModule {}
