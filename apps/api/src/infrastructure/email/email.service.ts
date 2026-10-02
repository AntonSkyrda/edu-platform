import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

import { EnvironmentService } from '../../config/environment.service';
import type { EmailContent } from './interfaces/email-content.interface';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;

  constructor(private readonly environmentService: EnvironmentService) {
    this.transporter = nodemailer.createTransport({
      host: this.environmentService.smtpHost,
      port: this.environmentService.smtpPort,
      secure: this.environmentService.smtpSecure,
      auth: {
        user: this.environmentService.smtpUser,
        pass: this.environmentService.smtpPassword,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.verifyConnection();
  }

  async send(message: EmailContent & { to: string }): Promise<void> {
    await this.transporter.sendMail({
      from: this.environmentService.smtpFrom,
      ...message,
    });
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();

      this.logger.log({ event: 'email.transport_ready' });
    } catch {
      this.logger.error({ event: 'email.transport_unavailable' });
    }
  }
}
