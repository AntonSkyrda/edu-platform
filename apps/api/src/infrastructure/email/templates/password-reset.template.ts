import { escapeHtml } from '../../../common/helpers/escape-html.helper';
import type { EmailContent } from '../interfaces/email-content.interface';

export function passwordResetTemplate(data: {
  firstName: string;
  resetUrl: string;
  expiresAt: Date;
}): EmailContent {
  const expiry = data.expiresAt.toISOString();
  return {
    subject: 'Reset your Edu Platform password',
    text: `Hello ${data.firstName},\n\nReset your password:\n${data.resetUrl}\n\nThis single-use link expires at ${expiry}. If you did not request this, ignore this email. Your password has not changed.`,
    html: `<html lang="en"><body style="font-family:Arial,sans-serif"><h1>Reset your password</h1><p>Hello ${escapeHtml(data.firstName)},</p><p><a href="${escapeHtml(data.resetUrl)}">Choose a new password</a></p><p>This single-use link expires at ${escapeHtml(expiry)}.</p><p>If you did not request this, ignore this email. Your password has not changed.</p></body></html>`,
  };
}

export function passwordChangedTemplate(firstName: string): EmailContent {
  return {
    subject: 'Your Edu Platform password was changed',
    text: `Hello ${firstName},\n\nYour password was changed and all existing sessions were signed out. If this was not you, contact your platform administrator immediately.`,
    html: `<html lang="en"><body style="font-family:Arial,sans-serif"><h1>Password changed</h1><p>Hello ${escapeHtml(firstName)},</p><p>Your password was changed and all existing sessions were signed out.</p><p>If this was not you, contact your platform administrator immediately.</p></body></html>`,
  };
}
