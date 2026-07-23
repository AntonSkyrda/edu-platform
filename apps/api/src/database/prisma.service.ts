import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(environmentService: EnvironmentService) {
    const adapter = new PrismaPg({
      connectionString: environmentService.databaseUrl,
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
