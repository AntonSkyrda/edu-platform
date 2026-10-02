import { createHmac, randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Transaction } from '@project/database';

import { hashToken } from '../../common/helpers/hash-token.helper';
import { EnvironmentService } from '../../config/environment.service';
import { InvitationsRepository } from '../repositories/invitations.repository';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly repository: InvitationsRepository,
    private readonly environment: EnvironmentService,
  ) {}

  async issue(userId: string, transaction: Transaction) {
    await this.repository.revokeUnusedForUser(userId, transaction);
    const id = randomUUID();
    const rawToken = this.deliveryToken(id);
    const invitation = await this.repository.create(
      {
        id,
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + this.environment.invitationTtlMs),
      },
      transaction,
    );
    return { invitation, rawToken };
  }

  deliveryToken(id: string): string {
    return createHmac('sha256', this.environment.invitationTokenSecret)
      .update(`invitation:${id}`)
      .digest('hex');
  }

  pendingDeliveries() {
    return this.repository.findPendingDeliveries();
  }

  async prepareDelivery(id: string) {
    const invitation = await this.repository.findById(id);
    if (!invitation || invitation.deliveryStatus !== 'pending') return null;
    const token = this.deliveryToken(id);
    if (hashToken(token) !== invitation.tokenHash) {
      await this.recordDelivery(id, 'failed', 'TOKEN_KEY_MISMATCH');
      return null;
    }
    const user = await this.findDeliverableUser(id, token);
    if (!user) {
      await this.recordDelivery(id, 'skipped');
      return null;
    }
    return { user, token, invitation };
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
    const invitation = await this.repository.findByTokenHash(hashToken(token));
    if (
      !invitation ||
      invitation.usedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    )
      throw new UnauthorizedException('Invalid or expired invitation');
    return invitation;
  }

  async consume(id: string, transaction: Transaction): Promise<void> {
    const invitation = await this.repository.consume(id, transaction);
    if (!invitation)
      throw new UnauthorizedException('Invalid or expired invitation');
  }

  revokeUnusedForUser(userId: string, transaction: Transaction): Promise<void> {
    return this.repository.revokeUnusedForUser(userId, transaction);
  }

  findDeliverableUser(id: string, token: string) {
    return this.repository.findDeliverableUser(id, hashToken(token));
  }
}
