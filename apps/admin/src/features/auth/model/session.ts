import { queryOptions } from '@tanstack/react-query';

import { ApiError } from '@/shared/api/api-error';
import { advanceSessionVersion } from '@/shared/api/client';

import { authApi } from '../api/auth-api';

let refreshPromise: Promise<void> | undefined;
export function recoverSession(): Promise<void> {
  if (!refreshPromise) {
    const recover = async () => {
      try {
        await authApi.me(undefined, false);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        await authApi.refresh();
      }
      advanceSessionVersion();
    };
    refreshPromise = (
      typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('edu-auth-session', recover)
        : recover()
    ).finally(() => {
      refreshPromise = undefined;
    });
  }
  return refreshPromise;
}
export async function endSession() {
  if (refreshPromise) await refreshPromise.catch(() => undefined);
  const logout = async () => {
    await authApi.logout();
    advanceSessionVersion();
  };
  if (navigator.locks)
    await navigator.locks.request('edu-auth-session', logout);
  else await logout();
}
export const sessionKey = ['auth', 'session'] as const;
export const sessionOptions = queryOptions({
  queryKey: sessionKey,
  queryFn: async ({ signal }) => {
    try {
      return await authApi.me(signal);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: 30_000,
  retry: false,
});
export function canAccessAdmin(role: string) {
  return role === 'ADMIN' || role === 'MANAGER';
}
