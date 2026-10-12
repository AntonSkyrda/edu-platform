import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

import { EnvironmentService } from '../../config/environment.service';
import type { EmailContent } from './interfaces/email-content.interface';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private available?: boolean;

  constructor(private readonly environmentService: EnvironmentService) {
    // SMTP is used only by delivery jobs. Do not probe it during API startup.
    // Each attempt opens its own connection; a failed attempt cannot poison
    // the next retry when the server becomes available again.
    this.transporter = nodemailer.createTransport({
      host: this.environmentService.smtpHost,
      port: this.environmentService.smtpPort,
      secure: this.environmentService.smtpSecure,
      dnsTimeout: this.environmentService.smtpDnsTimeoutMs,
      connectionTimeout: this.environmentService.smtpConnectionTimeoutMs,
      greetingTimeout: this.environmentService.smtpGreetingTimeoutMs,
      socketTimeout: this.environmentService.smtpSocketTimeoutMs,
      auth: {
        user: this.environmentService.smtpUser,
        pass: this.environmentService.smtpPassword,
      },
    });
  }

  async send(message: EmailContent & { to: string }): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.environmentService.smtpFrom,
        ...message,
      });
      if (this.available !== true)
        this.logger.log({ event: 'email.transport_ready' });
      this.available = true;
    } catch (error) {
      // Log state changes without SMTP responses, credentials or message bodies.
      // Propagate failures so the worker records them and BullMQ retries the job.
      if (this.available !== false)
        this.logger.warn({ event: 'email.transport_unavailable' });
      this.available = false;
      throw error;
    }
  }
}
