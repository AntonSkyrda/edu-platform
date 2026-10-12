import type { AuthUser } from './auth';
export interface InvitationDelivery {
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  dispatchAttempts: number;
  enqueuedAt: string | null;
  deliveredAt: string | null;
  errorCode: string | null;
  expiresAt: string;
}
export interface AdminUser extends AuthUser {
  invitation: InvitationDelivery | null;
}
export interface DeliveryMetric {
  kind: 'invitation' | 'password-reset' | 'password-changed';
  pending: number;
  failed: number;
  oldestPendingSeconds: number;
}
export interface DeliveryStatus {
  status: 'ok' | 'warning';
  metrics: DeliveryMetric[];
  workers: {
    online: number;
    activeJobs: number;
    lastCompletedAt: string | null;
    lastFailedAt: string | null;
  };
}
