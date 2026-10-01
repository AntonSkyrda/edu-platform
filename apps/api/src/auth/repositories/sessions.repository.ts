import { Injectable } from '@nestjs/common';
import {
  and,
  BaseRepository,
  eq,
  gt,
  isNull,
  type Transaction,
} from '@project/database';
import { users, userSessions } from '@project/database/schema';
import type { User, UserSession } from '@project/database/types';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class SessionsRepository extends BaseRepository<typeof userSessions> {
  constructor(database: DatabaseService) {
    super(database.db, userSessions);
  }

  async findByRefreshTokenHash(
    tokenHash: string,
    transaction?: Transaction,
  ): Promise<UserSession | null> {
    const [session] = await this.executor(transaction)
      .select()
      .from(userSessions)
      .where(eq(userSessions.refreshTokenHash, tokenHash))
      .limit(1);
    return session ?? null;
  }

  async findActive(
    id: string,
    userId: string,
    transaction?: Transaction,
  ): Promise<UserSession | null> {
    const [session] = await this.executor(transaction)
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.id, id),
          eq(userSessions.userId, userId),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, new Date()),
        ),
      );
    return session ?? null;
  }

  async rotate(
    id: string,
    previousHash: string,
    nextHash: string,
    transaction: Transaction,
  ): Promise<UserSession | null> {
    const [session] = await transaction
      .update(userSessions)
      .set({ refreshTokenHash: nextHash })
      .where(
        and(
          eq(userSessions.id, id),
          eq(userSessions.refreshTokenHash, previousHash),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, new Date()),
        ),
      )
      .returning();
    return session ?? null;
  }

  async findAuthenticatedUser(
    sessionId: string,
    userId: string,
  ): Promise<User | null> {
    const [row] = await this.database
      .select({ user: users })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(
        and(
          eq(userSessions.id, sessionId),
          eq(users.id, userId),
          eq(users.status, 'ACTIVE'),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, new Date()),
        ),
      );
    return row?.user ?? null;
  }

  async revokeForUser(userId: string, transaction: Transaction): Promise<void> {
    await transaction
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)),
      );
  }
}
