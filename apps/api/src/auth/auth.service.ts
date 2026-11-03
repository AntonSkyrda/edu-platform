import { randomBytes } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { InviteUserRequest, Permission } from '@project/contracts';
import type { Transaction } from '@project/database';
import type { User } from '@project/database/types';

import { PasswordService } from '../common/security/password.service';
import { DatabaseService } from '../database/database.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UsersService } from '../users/users.service';
import type { AuthContext } from './interfaces/auth-context.interface';
import { toAuthUser } from './mappers/auth-user.mapper';
import { AccessTokenService } from './services/access-token.service';
import { InvitationDeliveryService } from './services/invitation-delivery.service';
import { InvitationsService } from './services/invitations.service';
import { PasswordResetsService } from './services/password-resets.service';
import { SessionsService } from './services/sessions.service';

@Injectable()
export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly database: DatabaseService,
    private readonly accessTokens: AccessTokenService,
    private readonly passwords: PasswordService,
    private readonly delivery: InvitationDeliveryService,
    private readonly users: UsersService,
    private readonly invitations: InvitationsService,
    private readonly sessions: SessionsService,
    private readonly passwordResets: PasswordResetsService,
    private readonly permissions: PermissionsService,
  ) {
    this.dummyHash = passwords.hash(randomBytes(32).toString('hex'));
  }

  private async checkAdmin(tx: Transaction, actor: AuthContext): Promise<void> {
    const admin = await this.users.getByIdOrThrow(actor.user.id, {
      transaction: tx,
      lock: 'update',
    });
    const session = await this.sessions.findActive(
      actor.sessionId,
      admin.id,
      tx,
    );
    if (admin.role !== 'ADMIN' || admin.status !== 'ACTIVE' || !session)
      throw new ForbiddenException();
  }

  private deliver(user: User) {
    // The invitation is committed before this kick. PostgreSQL owns pending
    // deliveries; neither Redis availability nor queue latency gates HTTP.
    void this.delivery.recover();
    return toAuthUser(user);
  }

  async currentUser(actor: AuthContext) {
    return {
      ...actor.user,
      permissions: await this.permissions.effective(actor.user),
    };
  }
  async getPermissions(actor: AuthContext, userId: string) {
    return this.database.db.transaction(async (tx) => {
      await this.checkAdmin(tx, actor);
      return this.permissions.getAssigned(userId, tx);
    });
  }
  async setPermissions(
    actor: AuthContext,
    userId: string,
    permissions: Permission[],
    expectedVersion: number,
  ) {
    return this.database.db.transaction(async (tx) => {
      await this.checkAdmin(tx, actor);
      return this.permissions.replace(userId, permissions, expectedVersion, tx);
    });
  }
  async listUsers(actor: AuthContext, limit: number, offset: number) {
    return this.database.db.transaction(async (tx) => {
      await this.checkAdmin(tx, actor);
      const users = await this.users.findMany({ limit: limit + 1, offset }, tx);
      const page = users.slice(0, limit);
      const deliveries = await this.invitations.latestDeliveries(
        page.map((user) => user.id),
        tx,
      );
      return {
        items: page.map((user) => ({
          ...toAuthUser(user),
          invitation: deliveries.get(user.id) ?? null,
        })),
        hasMore: users.length > limit,
      };
    });
  }

  async invite(actor: AuthContext, data: InviteUserRequest) {
    const result = await this.database.db.transaction(async (tx) => {
      await this.checkAdmin(tx, actor);
      const user = await this.users.create(
        { ...data, status: 'INVITED', passwordHash: null },
        tx,
      );
      return { user, ...(await this.invitations.issue(user.id, tx)) };
    });
    return this.deliver(result.user);
  }

  async resend(actor: AuthContext, userId: string) {
    const result = await this.database.db.transaction(async (tx) => {
      await this.checkAdmin(tx, actor);
      const user = await this.users.getByIdOrThrow(userId, {
        transaction: tx,
        lock: 'update',
      });
      if (user.status !== 'INVITED')
        throw new ConflictException(
          'Only invited users can receive a new invitation',
        );
      return { user, ...(await this.invitations.issue(user.id, tx)) };
    });
    return this.deliver(result.user);
  }

  async acceptInvitation(rawToken: string, password: string) {
    const invitation = await this.invitations.getValidByToken(rawToken);
    const passwordHash = await this.passwords.hash(password);
    await this.database.db.transaction(async (tx) => {
      const user = await this.users.getByIdOrThrow(invitation.userId, {
        transaction: tx,
        lock: 'update',
      });
      if (user.status !== 'INVITED')
        throw new UnauthorizedException('Invalid or expired invitation');
      await this.invitations.consume(invitation.id, tx);
      await this.users.update(user.id, { passwordHash, status: 'ACTIVE' }, tx);
    });
    return { message: 'Account activated. Please sign in.' };
  }

  private async tokens(
    user: User,
    sessionId: string,
    refreshToken: string,
    expiresAt: Date,
  ) {
    return {
      ...(await this.accessTokens.issue(user.id, sessionId)),
      user: toAuthUser(user),
      refreshToken,
      refreshExpiresAt: expiresAt,
    };
  }

  async login(email: string, password: string) {
    const candidate = await this.users.findByEmail(email);
    const valid = await this.passwords.verify(
      candidate?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (
      !candidate ||
      !valid ||
      candidate.status !== 'ACTIVE' ||
      !candidate.passwordHash
    )
      throw new UnauthorizedException('Invalid email or password');
    return this.database.db.transaction(async (tx) => {
      const user = await this.users.getByIdOrThrow(candidate.id, {
        transaction: tx,
        lock: 'update',
      });
      if (
        user.status !== 'ACTIVE' ||
        user.passwordHash !== candidate.passwordHash
      )
        throw new UnauthorizedException('Invalid email or password');
      const { session, rawToken } = await this.sessions.create(user.id, tx);
      return this.tokens(user, session.id, rawToken, session.expiresAt);
    });
  }

  async refresh(rawToken: string) {
    const candidate = await this.sessions.getByRefreshToken(rawToken);
    return this.database.db.transaction(async (tx) => {
      const user = await this.users.getByIdOrThrow(candidate.userId, {
        transaction: tx,
        lock: 'update',
      });
      if (user.status !== 'ACTIVE') throw new UnauthorizedException();
      const { session, rawToken: nextToken } = await this.sessions.rotate(
        candidate.id,
        rawToken,
        tx,
      );
      return this.tokens(user, session.id, nextToken, session.expiresAt);
    });
  }

  async authenticate(accessToken: string): Promise<AuthContext> {
    const { userId, sessionId } = await this.accessTokens.verify(accessToken);
    const user = await this.sessions.findAuthenticatedUser(sessionId, userId);
    if (!user) throw new UnauthorizedException();
    return { user: toAuthUser(user), sessionId: sessionId };
  }

  async logout(refreshToken: string) {
    const session = await this.sessions.findByRefreshToken(refreshToken);
    if (session) {
      await this.database.db.transaction(async (tx) => {
        await this.users.getByIdOrThrow(session.userId, {
          transaction: tx,
          lock: 'update',
        });
        await this.sessions.revoke(session.id, tx);
      });
    }
    return { message: 'Signed out' };
  }

  async setBlocked(actor: AuthContext, userId: string, blocked: boolean) {
    await this.database.db.transaction(async (tx) => {
      await this.checkAdmin(tx, actor);
      const user = await this.users.getByIdOrThrow(userId, {
        transaction: tx,
        lock: 'update',
      });
      if (user.role === 'ADMIN')
        throw new ForbiddenException(
          'Admin accounts cannot be blocked through this endpoint',
        );
      if (!blocked && user.status !== 'BLOCKED')
        throw new ConflictException('User is not blocked');
      await this.users.update(
        user.id,
        {
          status: blocked
            ? 'BLOCKED'
            : user.passwordHash
              ? 'ACTIVE'
              : 'INVITED',
        },
        tx,
      );
      await this.sessions.revokeForUser(user.id, tx);
      await this.invitations.revokeUnusedForUser(user.id, tx);
      await this.passwordResets.revokeUnusedForUser(user.id, tx);
    });
    return {
      message: blocked
        ? 'User blocked'
        : 'User unblocked. A new login or invitation is required.',
    };
  }
}
