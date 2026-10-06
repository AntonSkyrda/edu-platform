import axios from 'axios';

import { normalizeApiError } from '@/shared/api/normalize-api-error';
import { env } from '@/shared/config/env';

export const apiClient = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
  timeout: 10000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    return Promise.reject(normalizeApiError(error));
  },
);
