import axios from 'axios';

import { env } from '@/shared/config/env';

import { normalizeApiError } from './normalize-api-error';

declare module 'axios' {
  interface AxiosRequestConfig {
    authenticated?: boolean;
    retried?: boolean;
    sessionVersion?: number;
  }
}

export const apiClient = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
  timeout: 10000,
});
let version = 0;
let recoverSession: (() => Promise<void>) | undefined;
let sessionExpired: (() => void) | undefined;

export function configureSessionRecovery(
  recover: () => Promise<void>,
  expired: () => void,
) {
  recoverSession = recover;
  sessionExpired = expired;
}
export function advanceSessionVersion() {
  version += 1;
}

apiClient.interceptors.request.use((config) => {
  config.sessionVersion = version;
  return config;
});
apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (axios.isCancel(error)) throw error;
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config?.authenticated
    ) {
      const config = error.config;
      if (!config.retried && recoverSession) {
        config.retried = true;
        try {
          if (config.sessionVersion === version) await recoverSession();
          return await apiClient.request(config);
        } catch (recoveryError) {
          if (axios.isCancel(recoveryError)) throw recoveryError;
          const normalized = normalizeApiError(recoveryError);
          if (normalized.status === 401) sessionExpired?.();
          throw normalized;
        }
      }
      if (!config.retried) sessionExpired?.();
    }
    throw normalizeApiError(error);
  },
);
