import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createDatabase, type Database } from '@project/database';

import { EnvironmentService } from '../config/environment.service';
import { LifecycleService } from '../infrastructure/lifecycle/lifecycle.service';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly connection: ReturnType<typeof createDatabase>;
  private healthCheck?: Promise<void>;
  readonly db: Database;

  constructor(
    environmentService: EnvironmentService,
    private readonly lifecycle: LifecycleService,
  ) {
    this.connection = createDatabase({
      connectionString: environmentService.databaseUrl,
      statement_timeout: environmentService.postgresStatementTimeoutMs,
      lock_timeout: environmentService.postgresLockTimeoutMs,
      idle_in_transaction_session_timeout:
        environmentService.postgresIdleTransactionTimeoutMs,
    });
    this.db = this.connection.db;
    this.connection.pool.on('error', (error: Error) => {
      this.logger.error({ event: 'database.pool_error', err: error });
    });
  }

  checkHealth(timeoutMs: number): Promise<void> {
    if (this.healthCheck) return this.healthCheck;

    // Probe the application's pool, so pool exhaustion also fails readiness.
    this.healthCheck = new Promise<void>((resolve, reject) => {
      let expired = false;
      let release: ((destroy?: boolean) => void) | undefined;
      const timer = setTimeout(() => {
        expired = true;
        release?.(true);
        reject(new Error('PostgreSQL health check timed out'));
      }, timeoutMs);

      void (async () => {
        try {
          const client = await this.connection.pool.connect();
          if (expired) {
            client.release();
            return;
          }
          let released = false;
          const onError = (error: Error) => {
            release?.(true);
            reject(error);
          };
          release = (destroy = false) => {
            if (released) return;
            released = true;
            client.release(destroy);
            client.removeListener('error', onError);
          };
          client.on('error', onError);
          await client.query('SELECT 1');
          release();
          resolve();
        } catch (error) {
          release?.(true);
          reject(error);
        } finally {
          clearTimeout(timer);
          // Retain a timed-out acquisition until it actually settles; subsequent
          // probes reuse its failure instead of filling the pool's waiting queue.
          this.healthCheck = undefined;
        }
      })();
    });
    return this.healthCheck;
  }

  async onModuleDestroy(): Promise<void> {
    await this.lifecycle?.drain();
    await this.connection.pool.end();
  }
}
