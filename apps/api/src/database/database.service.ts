import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createDatabase, type Database, sql } from '@project/database';

import { EnvironmentService } from '../config/environment.service';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly connection: ReturnType<typeof createDatabase>;
  readonly db: Database;

  constructor(environmentService: EnvironmentService) {
    this.connection = createDatabase({
      connectionString: environmentService.databaseUrl,
    });
    this.db = this.connection.db;
    this.connection.pool.on('error', (error: Error) => {
      this.logger.error({ event: 'database.pool_error', err: error });
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.db.execute(sql`SELECT 1`);
      this.logger.log({ event: 'database.connected' });
    } catch (error) {
      await this.connection.pool.end();
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection.pool.end();
  }
}
