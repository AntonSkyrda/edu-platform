import { randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { DeliveryMetric, DeliveryStatus } from '@project/contracts';
import { sql } from '@project/database';

import { EnvironmentService } from '../../config/environment.service';
import { DatabaseService } from '../../database/database.service';
import { LifecycleService } from '../../infrastructure/lifecycle/lifecycle.service';

@Injectable()
export class DeliveryMonitorService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(DeliveryMonitorService.name);
  private readonly id = randomUUID();
  private timer?: ReturnType<typeof setInterval>;
  private poll?: Promise<void>;
  private lastStatus?: string;
  private active = 0;
  private completed?: Date;
  private failed?: Date;
  constructor(
    private readonly database: DatabaseService,
    private readonly environment: EnvironmentService,
    private readonly lifecycle: LifecycleService,
  ) {}

  async track<T>(operation: () => Promise<T>): Promise<T> {
    this.active++;
    try {
      const result = await operation();
      this.completed = new Date();
      return result;
    } catch (error) {
      this.failed = new Date();
      throw error;
    } finally {
      this.active--;
    }
  }

  async status(): Promise<DeliveryStatus> {
    const result = await this.database.db.execute<
      DeliveryMetric & Record<string, unknown>
    >(sql`
      SELECT 'invitation' AS kind, count(*) FILTER (WHERE delivery_status = 'pending')::int AS pending,
        count(*) FILTER (WHERE delivery_status = 'failed' AND revoked_at IS NULL AND used_at IS NULL AND expires_at > now())::int AS failed,
        coalesce(greatest(0, extract(epoch FROM now() - min(created_at) FILTER (WHERE delivery_status = 'pending')))::int, 0) AS "oldestPendingSeconds"
      FROM user_invitations
      UNION ALL
      SELECT 'password-reset', count(*) FILTER (WHERE delivery_status = 'pending')::int,
        count(*) FILTER (WHERE delivery_status = 'failed' AND revoked_at IS NULL AND used_at IS NULL AND expires_at > now())::int,
        coalesce(greatest(0, extract(epoch FROM now() - min(created_at) FILTER (WHERE delivery_status = 'pending')))::int, 0)
      FROM password_resets
      UNION ALL
      SELECT 'password-changed', count(*) FILTER (WHERE notification_status = 'pending')::int,
        count(*) FILTER (WHERE notification_status = 'failed')::int,
        coalesce(greatest(0, extract(epoch FROM now() - min(used_at) FILTER (WHERE notification_status = 'pending')))::int, 0)
      FROM password_resets
    `);
    const heartbeat = await this.database.db.execute<{
      online: number;
      activeJobs: number;
      lastCompletedAt: string | null;
      lastFailedAt: string | null;
    }>(sql`
      SELECT count(*) FILTER (WHERE seen_at > now() - interval '60 seconds')::int AS online,
        coalesce(sum(active_jobs) FILTER (WHERE seen_at > now() - interval '60 seconds'), 0)::int AS "activeJobs",
        max(last_completed_at) AS "lastCompletedAt", max(last_failed_at) AS "lastFailedAt"
      FROM mail_worker_heartbeats
    `);
    const workers = heartbeat.rows[0];
    return {
      status: result.rows.some(
        (row) =>
          row.failed > 0 ||
          row.oldestPendingSeconds >=
            this.environment.mailBacklogWarningSeconds ||
          (row.pending > 0 && !workers.online),
      )
        ? 'warning'
        : 'ok',
      metrics: result.rows,
      workers: {
        ...workers,
        lastCompletedAt: workers.lastCompletedAt
          ? new Date(workers.lastCompletedAt).toISOString()
          : null,
        lastFailedAt: workers.lastFailedAt
          ? new Date(workers.lastFailedAt).toISOString()
          : null,
      },
    };
  }
  private tick(): Promise<void> {
    return (this.poll ??= this.update().finally(() => {
      this.poll = undefined;
    }));
  }
  private async update(): Promise<void> {
    try {
      await this.database.db.execute(sql`
        INSERT INTO mail_worker_heartbeats(id, seen_at, active_jobs, last_completed_at, last_failed_at)
        VALUES (${this.id}::uuid, now(), ${this.active}, ${this.completed?.toISOString() ?? null}::timestamptz, ${this.failed?.toISOString() ?? null}::timestamptz)
        ON CONFLICT (id) DO UPDATE SET seen_at = now(), active_jobs = excluded.active_jobs,
          last_completed_at = excluded.last_completed_at, last_failed_at = excluded.last_failed_at
      `);
      await this.database.db.execute(
        sql`DELETE FROM mail_worker_heartbeats WHERE seen_at < now() - interval '7 days'`,
      );
      const status = await this.status();
      if (status.status !== this.lastStatus) {
        const event = {
          event:
            status.status === 'warning'
              ? 'mail.delivery_alert'
              : 'mail.delivery_healthy',
          ...status,
        };
        if (status.status === 'warning') this.logger.warn(event);
        else this.logger.log(event);
        this.lastStatus = status.status;
      }
    } catch {
      if (this.lastStatus !== 'unavailable')
        this.logger.warn({ event: 'mail.monitor_unavailable' });
      this.lastStatus = 'unavailable';
    }
  }
  async stopWorker(): Promise<void> {
    await this.onModuleDestroy();
    await this.database.db.execute(sql`
      UPDATE mail_worker_heartbeats SET seen_at = now() - interval '61 seconds', active_jobs = 0,
        last_completed_at = ${this.completed?.toISOString() ?? null}::timestamptz,
        last_failed_at = ${this.failed?.toISOString() ?? null}::timestamptz
      WHERE id = ${this.id}::uuid
    `);
  }
  onApplicationBootstrap(): void {
    this.lifecycle.register('delivery-monitor', () => this.onModuleDestroy());
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 15000);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.poll;
  }
}
