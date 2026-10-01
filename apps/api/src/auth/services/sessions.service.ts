import { randomBytes } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Transaction } from '@project/database';

import { hashToken } from '../../common/helpers/hash-token.helper';
import { EnvironmentService } from '../../config/environment.service';
import { SessionsRepository } from '../repositories/sessions.repository';

@Injectable()
export class SessionsService {
  constructor(
    private readonly repository: SessionsRepository,
    private readonly environment: EnvironmentService,
  ) {}

  async create(userId: string, transaction: Transaction) {
    const rawToken = randomBytes(32).toString('hex');
    const session = await this.repository.create(
      {
        userId,
        refreshTokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + this.environment.sessionTtlMs),
      },
      transaction,
    );
    return { session, rawToken };
  }

  findByRefreshToken(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) return Promise.resolve(null);
    return this.repository.findByRefreshTokenHash(hashToken(token));
  }

  async getByRefreshToken(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException();
    const session = await this.repository.findByRefreshTokenHash(
      hashToken(token),
    );
    if (!session) throw new UnauthorizedException();
    return session;
  }

  async rotate(id: string, previousToken: string, transaction: Transaction) {
    const rawToken = randomBytes(32).toString('hex');
    const session = await this.repository.rotate(
      id,
      hashToken(previousToken),
      hashToken(rawToken),
      transaction,
    );
    if (!session) throw new UnauthorizedException();
    return { session, rawToken };
  }

  findActive(id: string, userId: string, transaction?: Transaction) {
    return this.repository.findActive(id, userId, transaction);
  }

  findAuthenticatedUser(sessionId: string, userId: string) {
    return this.repository.findAuthenticatedUser(sessionId, userId);
  }

  async revoke(id: string, transaction: Transaction): Promise<void> {
    await this.repository.update(id, { revokedAt: new Date() }, transaction);
  }

  revokeForUser(userId: string, transaction: Transaction): Promise<void> {
    return this.repository.revokeForUser(userId, transaction);
  }
}
