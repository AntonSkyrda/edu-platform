import {
  type ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';

// Guards run before interceptors. Keep their database work alive even when the
// caller disconnects, and never continue into a handler after that disconnect.
export async function trackGuard<T>(
  context: ExecutionContext,
  operation: () => Promise<T>,
): Promise<T> {
  const response = context.switchToHttp().getResponse<Response>();
  if (response.destroyed)
    throw new ServiceUnavailableException('Request closed');
  response.locals.activeGuards = (response.locals.activeGuards ?? 0) + 1;
  try {
    const result = await operation();
    if (response.destroyed)
      throw new ServiceUnavailableException('Request closed');
    return result;
  } finally {
    response.locals.activeGuards--;
    if (response.destroyed && !response.locals.activeGuards)
      response.locals.finishRequest?.();
  }
}
