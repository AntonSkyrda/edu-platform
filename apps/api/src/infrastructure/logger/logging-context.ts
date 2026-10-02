import { AsyncLocalStorage } from 'node:async_hooks';

export interface LoggingContext {
  requestId: string;
  jobId?: string;
  invitationId?: string;
}

export const loggingContext = new AsyncLocalStorage<LoggingContext>();
