import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EnvironmentModule } from '../config/environment.module';

@Module({
  imports: [EnvironmentModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
