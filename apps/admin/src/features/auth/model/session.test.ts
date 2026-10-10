import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/api-error';

import { authApi } from '../api/auth-api';
import { canAccessAdmin, recoverSession } from './session';
vi.mock('../api/auth-api', () => ({
  authApi: { me: vi.fn(), refresh: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
});
describe('session recovery', () => {
  it('shares a refresh across concurrent failures', async () => {
    vi.mocked(authApi.me).mockRejectedValue(
      new ApiError('Unauthorized', { kind: 'http', status: 401 }),
    );
    await Promise.all([recoverSession(), recoverSession(), recoverSession()]);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);
  });
  it('does not rotate when another request or tab already restored access', async () => {
    vi.mocked(authApi.me).mockResolvedValue({ id: '1' } as Awaited<
      ReturnType<typeof authApi.me>
    >);
    await recoverSession();
    expect(authApi.refresh).not.toHaveBeenCalled();
  });
  it('preserves network errors without attempting refresh', async () => {
    const error = new ApiError('Offline', { kind: 'network' });
    vi.mocked(authApi.me).mockRejectedValue(error);
    await expect(recoverSession()).rejects.toBe(error);
    expect(authApi.refresh).not.toHaveBeenCalled();
  });
  it('clears failed single-flight promise so a later attempt can recover', async () => {
    vi.mocked(authApi.me).mockRejectedValue(
      new ApiError('Expired', { kind: 'http', status: 401 }),
    );
    vi.mocked(authApi.refresh)
      .mockRejectedValueOnce(
        new ApiError('Expired', { kind: 'http', status: 401 }),
      )
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof authApi.refresh>>);
    await expect(recoverSession()).rejects.toMatchObject({ status: 401 });
    await recoverSession();
    expect(authApi.refresh).toHaveBeenCalledTimes(2);
  });
  it('limits admin access to administrators and managers', () => {
    expect(canAccessAdmin('ADMIN')).toBe(true);
    expect(canAccessAdmin('MANAGER')).toBe(true);
    expect(canAccessAdmin('TEACHER')).toBe(false);
    expect(canAccessAdmin('STUDENT')).toBe(false);
  });
});
