import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

import { EnvironmentService } from '../../config/environment.service';

@Injectable()
export class EmailService {
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

    void this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();

      this.logger.log('SMTP connection established');
    } catch (error) {
      this.logger.error('Failed to connect to SMTP', error);
    }
  }
}
