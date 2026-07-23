import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvironmentModule } from './config/environment.module';
import { PrismaModule } from './database/prisma.module';

@Module({
  imports: [EnvironmentModule, PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
