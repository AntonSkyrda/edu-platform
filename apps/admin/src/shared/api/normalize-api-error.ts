import axios from 'axios';

import { ApiError } from './api-error';

function extractMessages(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || !('detail' in data)) {
    return [];
  }

  const detail = data.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return [detail];
  }

  if (Array.isArray(detail)) {
    return detail.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }

  return [];
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (!axios.isAxiosError<unknown>(error)) {
    return new ApiError('Сталася непередбачена помилка.', {
      kind: 'unknown',
    });
  }

  if (error.response) {
    const messages = extractMessages(error.response.data);

    return new ApiError(messages[0] ?? 'Не вдалося виконати запит.', {
      kind: 'http',
      status: error.response.status,
      code:
        typeof error.response.data === 'object' &&
        error.response.data !== null &&
        'code' in error.response.data &&
        typeof error.response.data.code === 'string'
          ? error.response.data.code
          : undefined,
      messages: messages.length ? messages : undefined,
    });
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new ApiError('Час очікування відповіді вичерпано.', {
      kind: 'timeout',
    });
  }

  if (error.code === 'ERR_NETWORK') {
    return new ApiError('Не вдалося з’єднатися із сервером.', {
      kind: 'network',
    });
  }

  return new ApiError('Не вдалося відправити запит.', {
    kind: 'unknown',
  });
}
