import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, expect, it, vi } from 'vitest';

import { API_ENDPOINTS } from '@/shared/api/endpoints';

import {
  advanceSessionVersion,
  apiClient,
  configureSessionRecovery,
} from './client';
function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
    status: 401,
    statusText: 'Unauthorized',
    data: { detail: 'Expired session' },
    headers: {},
    config,
  });
}
const recover = vi.fn();
const expired = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  configureSessionRecovery(recover, expired);
});
it('does not refresh a failed public login', async () => {
  apiClient.defaults.adapter = async (config) => {
    throw unauthorized(config);
  };
  await expect(apiClient.post(API_ENDPOINTS.auth.login)).rejects.toMatchObject({
    status: 401,
  });
  expect(recover).not.toHaveBeenCalled();
  expect(expired).not.toHaveBeenCalled();
});
it('retries authenticated requests only once', async () => {
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    throw unauthorized(config);
  });
  apiClient.defaults.adapter = adapter;
  await expect(
    apiClient.get(API_ENDPOINTS.users.list, { authenticated: true }),
  ).rejects.toMatchObject({ status: 401 });
  expect(adapter).toHaveBeenCalledTimes(2);
  expect(recover).toHaveBeenCalledTimes(1);
  expect(expired).toHaveBeenCalled();
});
it('retries delayed 401 with the newer session instead of refreshing again', async () => {
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    if (!config.retried) {
      advanceSessionVersion();
      throw unauthorized(config);
    }
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { ok: true },
    };
  });
  apiClient.defaults.adapter = adapter;
  await expect(
    apiClient.get(API_ENDPOINTS.users.list, { authenticated: true }),
  ).resolves.toMatchObject({ data: { ok: true } });
  expect(recover).not.toHaveBeenCalled();
});
it('keeps network failures distinct from session expiry', async () => {
  apiClient.defaults.adapter = async (config) => {
    throw unauthorized(config);
  };
  recover.mockRejectedValue(new AxiosError('Offline', 'ERR_NETWORK'));
  await expect(
    apiClient.get(API_ENDPOINTS.auth.me, { authenticated: true }),
  ).rejects.toMatchObject({ kind: 'network' });
  expect(expired).not.toHaveBeenCalled();
});
