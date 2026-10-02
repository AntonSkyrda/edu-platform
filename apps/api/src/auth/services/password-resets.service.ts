import { createHmac, randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Transaction } from '@project/database';

import { hashToken } from '../../common/helpers/hash-token.helper';
import { EnvironmentService } from '../../config/environment.service';
import { PasswordResetsRepository } from '../repositories/password-resets.repository';

@Injectable()
export class PasswordResetsService {
  constructor(
    private readonly repository: PasswordResetsRepository,
    private readonly environment: EnvironmentService,
  ) {}

  async issue(userId: string, transaction: Transaction) {
    if (
      await this.repository.hasRecentRequest(
        userId,
        new Date(Date.now() - this.environment.passwordResetCooldownMs),
        transaction,
      )
    )
      return null;
    await this.repository.revokeUnusedForUser(userId, transaction);
    const id = randomUUID();
    const rawToken = this.deliveryToken(id);
    const reset = await this.repository.create(
      {
        id,
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + this.environment.passwordResetTtlMs),
      },
      transaction,
    );
    return { reset, rawToken };
  }

  deliveryToken(id: string): string {
    return createHmac('sha256', this.environment.passwordResetTokenSecret)
      .update(`password-reset:${id}`)
      .digest('hex');
  }

  pendingNotifications() {
    return this.repository.findPendingNotifications();
  }
  prepareNotification(id: string) {
    return this.repository.findNotification(id);
  }
  recordNotification(
    id: string,
    status: 'sent' | 'failed' | 'pending',
    error?: string,
  ) {
    return this.repository.recordNotification(id, status, error);
  }

  pendingDeliveries() {
    return this.repository.findPendingDeliveries();
  }

  async prepareDelivery(id: string) {
    const reset = await this.repository.findById(id);
    if (!reset || reset.deliveryStatus !== 'pending') return null;
    const token = this.deliveryToken(id);
    if (hashToken(token) !== reset.tokenHash) {
      await this.recordDelivery(id, 'failed', 'TOKEN_KEY_MISMATCH');
      return null;
    }
    const user = await this.findDeliverableUser(id, token);
    if (!user) {
      await this.recordDelivery(id, 'skipped');
      return null;
    }
    return { user, token, reset };
  }

  recordDelivery(
    id: string,
    status: 'sent' | 'failed' | 'skipped',
    error?: string,
  ) {
    return this.repository.update(id, {
      deliveryStatus: status,
      deliveryError: error ?? null,
      ...(status === 'sent' ? { deliveredAt: new Date() } : {}),
    });
  }

  recordDeliveryAttempt(id: string, error?: string) {
    return this.repository.recordDeliveryAttempt(id, error);
  }

  async getValidByToken(token: string) {
    const reset = await this.repository.findByTokenHash(hashToken(token));
    if (
      !reset ||
      reset.usedAt ||
      reset.revokedAt ||
      reset.expiresAt <= new Date()
    )
      throw new UnauthorizedException(
        'Invalid or expired password reset token',
      );
    return reset;
  }

  async consume(id: string, transaction: Transaction): Promise<void> {
    const reset = await this.repository.consume(id, transaction);
    if (!reset)
      throw new UnauthorizedException(
        'Invalid or expired password reset token',
      );
  }

  revokeUnusedForUser(userId: string, transaction: Transaction): Promise<void> {
    return this.repository.revokeUnusedForUser(userId, transaction);
  }

  findDeliverableUser(id: string, token: string) {
    return this.repository.findDeliverableUser(id, hashToken(token));
  }
}
