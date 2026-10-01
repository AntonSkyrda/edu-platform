import { escapeHtml } from '../../../common/helpers/escape-html.helper';
import type { EmailContent } from '../interfaces/email-content.interface';

interface InvitationTemplateData {
  firstName: string;
  invitationUrl: string;
  validForHours: number;
}

export const invitationTemplate = ({
  firstName,
  invitationUrl,
  validForHours,
}: InvitationTemplateData): EmailContent => {
  const name = escapeHtml(firstName);
  const url = escapeHtml(invitationUrl);
  const expiry = `This invitation is valid for ${validForHours} hours from creation.`;

  return {
    subject: 'Your invitation to Edu Platform',
    text: `Hello ${firstName},\n\nSet your password to join Edu Platform:\n${invitationUrl}\n\n${expiry} If you did not expect it, ignore this email.`,
    html: `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your invitation to Edu Platform</title></head>
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,sans-serif;color:#202124">
    <main style="max-width:560px;margin:0 auto;padding:32px;background:#ffffff;border-radius:12px">
      <h1 style="font-size:24px">You're invited to Edu Platform</h1>
      <p>Hello ${name},</p>
      <p>Set your password to join Edu Platform.</p>
      <p style="margin:28px 0"><a href="${url}" style="display:inline-block;padding:14px 24px;background:#2457d6;color:#ffffff;text-decoration:none;border-radius:6px">Set your password</a></p>
      <p>${expiry}</p>
      <p>If the button does not work, open this link:</p>
      <p style="overflow-wrap:anywhere"><a href="${url}">${url}</a></p>
      <p style="color:#666666">If you did not expect this invitation, ignore this email.</p>
    </main>
  </body>
</html>`,
  };
};
