import { Injectable } from '@nestjs/common';
import {
  and,
  BaseRepository,
  eq,
  gt,
  inArray,
  isNull,
  sql,
  type Transaction,
} from '@project/database';
import { userInvitations, users } from '@project/database/schema';
import type { User, UserInvitation } from '@project/database/types';

import { DatabaseService } from '../../database/database.service';
import {
  claimDelivery,
  type DeliveryClaim,
  type DeliveryKind,
  finishDispatch,
} from './delivery-dispatch';

@Injectable()
export class InvitationsRepository extends BaseRepository<
  typeof userInvitations
> {
  constructor(database: DatabaseService) {
    super(database.db, userInvitations);
  }

  claimDelivery(leaseMs: number, kind: DeliveryKind = 'invitation') {
    return claimDelivery(this.database, kind, leaseMs);
  }
  finishDispatch(
    claim: DeliveryClaim,
    sent: boolean,
    retryMs: number,
    kind: DeliveryKind = 'invitation',
  ) {
    return finishDispatch(this.database, kind, claim, sent, retryMs);
  }

  async latestDeliveries(userIds: string[], tx: Transaction) {
    if (!userIds.length) return [];
    return tx
      .selectDistinctOn([userInvitations.userId], {
        userId: userInvitations.userId,
        status: userInvitations.deliveryStatus,
        attempts: userInvitations.deliveryAttempts,
        dispatchAttempts: userInvitations.dispatchAttempts,
        enqueuedAt: userInvitations.lastEnqueuedAt,
        deliveredAt: userInvitations.deliveredAt,
        errorCode: userInvitations.deliveryError,
        expiresAt: userInvitations.expiresAt,
      })
      .from(userInvitations)
      .where(inArray(userInvitations.userId, userIds))
      .orderBy(
        userInvitations.userId,
        sql`${userInvitations.createdAt} DESC`,
        sql`${userInvitations.id} DESC`,
      );
  }

  findPendingDeliveries() {
    return this.database
      .select({ id: userInvitations.id })
      .from(userInvitations)
      .where(eq(userInvitations.deliveryStatus, 'pending'))
      .orderBy(userInvitations.createdAt)
      .limit(100);
  }

  async recordDeliveryAttempt(id: string, error?: string): Promise<void> {
    await this.database
      .update(userInvitations)
      .set({
        deliveryAttempts: sql`${userInvitations.deliveryAttempts} + 1`,
        deliveryError: error ?? null,
      })
      .where(eq(userInvitations.id, id));
  }

  async findByTokenHash(
    tokenHash: string,
    transaction?: Transaction,
  ): Promise<UserInvitation | null> {
    const [invitation] = await this.executor(transaction)
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.tokenHash, tokenHash))
      .limit(1);
    return invitation ?? null;
  }

  async revokeUnusedForUser(
    userId: string,
    transaction: Transaction,
  ): Promise<void> {
    await transaction
      .update(userInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(userInvitations.userId, userId),
          isNull(userInvitations.usedAt),
          isNull(userInvitations.revokedAt),
        ),
      );
  }

  async consume(
    id: string,
    transaction: Transaction,
  ): Promise<UserInvitation | null> {
    const [invitation] = await transaction
      .update(userInvitations)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(userInvitations.id, id),
          isNull(userInvitations.usedAt),
          isNull(userInvitations.revokedAt),
          gt(userInvitations.expiresAt, new Date()),
        ),
      )
      .returning();
    return invitation ?? null;
  }

  async findDeliverableUser(
    id: string,
    tokenHash: string,
  ): Promise<User | null> {
    const [row] = await this.database
      .select({ user: users })
      .from(userInvitations)
      .innerJoin(users, eq(userInvitations.userId, users.id))
      .where(
        and(
          eq(userInvitations.id, id),
          eq(userInvitations.tokenHash, tokenHash),
          isNull(userInvitations.usedAt),
          isNull(userInvitations.revokedAt),
          gt(userInvitations.expiresAt, new Date()),
          eq(users.status, 'INVITED'),
        ),
      );
    return row?.user ?? null;
  }
}
