import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthGuard } from '../common/guards/auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { SecurityModule } from '../common/security/security.module';
import { EnvironmentModule } from '../config/environment.module';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../infrastructure/email/email.module';
import { QueueModule } from '../infrastructure/queue/queue.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthEmailProcessor } from './processors/auth-email.processor';
import { InvitationEmailProcessor } from './processors/invitation-email.processor';
import { PasswordResetEmailProcessor } from './processors/password-reset-email.processor';
import { InvitationsRepository } from './repositories/invitations.repository';
import { PasswordResetsRepository } from './repositories/password-resets.repository';
import { SessionsRepository } from './repositories/sessions.repository';
import { AccessTokenService } from './services/access-token.service';
import { InvitationDeliveryService } from './services/invitation-delivery.service';
import { InvitationsService } from './services/invitations.service';
import { PasswordRecoveryService } from './services/password-recovery.service';
import { PasswordResetDeliveryService } from './services/password-reset-delivery.service';
import { PasswordResetsService } from './services/password-resets.service';
import { SessionsService } from './services/sessions.service';

@Module({
  imports: [
    EnvironmentModule,
    SecurityModule,
    UsersModule,
    DatabaseModule,
    EmailModule,
    QueueModule,
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetsRepository,
    PasswordResetsService,
    PasswordRecoveryService,
    PasswordResetDeliveryService,
    PasswordResetEmailProcessor,
    AuthEmailProcessor,
    AccessTokenService,
    InvitationDeliveryService,
    InvitationsRepository,
    SessionsRepository,
    InvitationsService,
    SessionsService,
    InvitationEmailProcessor,
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
