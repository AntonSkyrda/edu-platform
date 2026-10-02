import { setTimeout } from 'node:timers/promises';

import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PasswordService } from '../../common/security/password.service';
import { EnvironmentService } from '../../config/environment.service';
import { DatabaseService } from '../../database/database.service';
import { UsersService } from '../../users/users.service';
import { PasswordResetsService } from './password-resets.service';
import { SessionsService } from './sessions.service';

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly users: UsersService,
    private readonly resets: PasswordResetsService,
    private readonly sessions: SessionsService,
    private readonly passwords: PasswordService,
    private readonly environment: EnvironmentService,
  ) {}

  async request(email: string) {
    const started = performance.now();
    try {
      const candidate = await this.users.findByEmail(email);
      if (candidate)
        await this.database.db.transaction(async (tx) => {
          const user = await this.users.getByIdOrThrow(candidate.id, {
            transaction: tx,
            lock: 'update',
          });
          if (user.status === 'ACTIVE' && user.passwordHash)
            await this.resets.issue(user.id, tx);
        });
    } finally {
      await setTimeout(
        Math.max(
          0,
          this.environment.passwordResetResponseMinMs -
            (performance.now() - started),
        ),
      );
    }
    return {
      message:
        'If this account is eligible, you will receive a password reset email.',
    };
  }

  async reset(token: string, password: string) {
    const candidate = await this.resets.getValidByToken(token);
    const passwordHash = await this.passwords.hash(password);
    await this.database.db.transaction(async (tx) => {
      const user = await this.users.getByIdOrThrow(candidate.userId, {
        transaction: tx,
        lock: 'update',
      });
      if (user.status !== 'ACTIVE' || !user.passwordHash)
        throw new UnauthorizedException(
          'Invalid or expired password reset token',
        );
      await this.resets.consume(candidate.id, tx);
      await this.users.update(user.id, { passwordHash }, tx);
      await this.sessions.revokeForUser(user.id, tx);
      await this.resets.revokeUnusedForUser(user.id, tx);
    });
    return { message: 'Password reset. Please sign in again.' };
  }
}
