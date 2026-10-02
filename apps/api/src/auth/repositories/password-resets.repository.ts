import { Injectable } from '@nestjs/common';
import {
  and,
  BaseRepository,
  eq,
  gt,
  isNull,
  sql,
  type Transaction,
} from '@project/database';
import { passwordResets, users } from '@project/database/schema';
import type { PasswordReset, User } from '@project/database/types';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class PasswordResetsRepository extends BaseRepository<
  typeof passwordResets
> {
  constructor(database: DatabaseService) {
    super(database.db, passwordResets);
  }

  findPendingDeliveries() {
    return this.database
      .select({ id: passwordResets.id })
      .from(passwordResets)
      .where(eq(passwordResets.deliveryStatus, 'pending'))
      .orderBy(passwordResets.createdAt)
      .limit(100);
  }

  async recordDeliveryAttempt(id: string, error?: string): Promise<void> {
    await this.database
      .update(passwordResets)
      .set({
        deliveryAttempts: sql`${passwordResets.deliveryAttempts} + 1`,
        deliveryError: error ?? null,
      })
      .where(eq(passwordResets.id, id));
  }

  async hasRecentRequest(
    userId: string,
    since: Date,
    transaction: Transaction,
  ): Promise<boolean> {
    const rows = await transaction
      .select({ id: passwordResets.id })
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.userId, userId),
          gt(passwordResets.createdAt, since),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  findPendingNotifications() {
    return this.database
      .select({ id: passwordResets.id })
      .from(passwordResets)
      .where(eq(passwordResets.notificationStatus, 'pending'))
      .orderBy(passwordResets.createdAt)
      .limit(100);
  }

  async findNotification(id: string) {
    const [row] = await this.database
      .select({ user: users, reset: passwordResets })
      .from(passwordResets)
      .innerJoin(users, eq(passwordResets.userId, users.id))
      .where(
        and(
          eq(passwordResets.id, id),
          eq(passwordResets.notificationStatus, 'pending'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async recordNotification(
    id: string,
    status: 'sent' | 'failed' | 'pending',
    error?: string,
  ): Promise<void> {
    await this.database
      .update(passwordResets)
      .set({
        notificationStatus: status,
        notificationError: error ?? null,
        notificationAttempts: sql`${passwordResets.notificationAttempts} + 1`,
      })
      .where(eq(passwordResets.id, id));
  }

  async findByTokenHash(
    tokenHash: string,
    transaction?: Transaction,
  ): Promise<PasswordReset | null> {
    const [reset] = await this.executor(transaction)
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.tokenHash, tokenHash))
      .limit(1);
    return reset ?? null;
  }

  async revokeUnusedForUser(
    userId: string,
    transaction: Transaction,
  ): Promise<void> {
    await transaction
      .update(passwordResets)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(passwordResets.userId, userId),
          isNull(passwordResets.usedAt),
          isNull(passwordResets.revokedAt),
        ),
      );
  }

  async consume(
    id: string,
    transaction: Transaction,
  ): Promise<PasswordReset | null> {
    const [reset] = await transaction
      .update(passwordResets)
      .set({ usedAt: new Date(), notificationStatus: 'pending' })
      .where(
        and(
          eq(passwordResets.id, id),
          isNull(passwordResets.usedAt),
          isNull(passwordResets.revokedAt),
          gt(passwordResets.expiresAt, new Date()),
        ),
      )
      .returning();
    return reset ?? null;
  }

  async findDeliverableUser(
    id: string,
    tokenHash: string,
  ): Promise<User | null> {
    const [row] = await this.database
      .select({ user: users })
      .from(passwordResets)
      .innerJoin(users, eq(passwordResets.userId, users.id))
      .where(
        and(
          eq(passwordResets.id, id),
          eq(passwordResets.tokenHash, tokenHash),
          isNull(passwordResets.usedAt),
          isNull(passwordResets.revokedAt),
          gt(passwordResets.expiresAt, new Date()),
          eq(users.status, 'ACTIVE'),
        ),
      );
    return row?.user ?? null;
  }
}
