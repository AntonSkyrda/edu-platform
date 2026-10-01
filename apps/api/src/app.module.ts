import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { EnvironmentModule } from './config/environment.module';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './infrastructure/email/email.module';
import { QueueModule } from './infrastructure/queue/queue.module';

@Module({
  imports: [
    AuthModule,
    EnvironmentModule,
    DatabaseModule,
    QueueModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
