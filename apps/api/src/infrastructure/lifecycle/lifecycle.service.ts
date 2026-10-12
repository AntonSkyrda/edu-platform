import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { EnvironmentService } from '../../config/environment.service';

@Injectable()
export class LifecycleService implements OnModuleDestroy {
  private readonly logger = new Logger(LifecycleService.name);
  private readonly participants = new Map<string, () => Promise<unknown>>();
  private draining?: Promise<void>;
  private activeRequests = 0;
  private requestDrained?: () => void;
  isDraining = false;

  constructor(private readonly environment: EnvironmentService) {}

  register(name: string, stopAndDrain: () => Promise<unknown>): void {
    if (this.isDraining)
      throw new Error('Cannot register work during shutdown');
    this.participants.set(name, stopAndDrain);
  }

  readonly middleware = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    if (this.isDraining && request.path !== '/health/live') {
      response.setHeader('Connection', 'close');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Retry-After', '1');
      response
        .status(503)
        .json({
          status_code: 503,
          result: 'error',
          code: 'SHUTTING_DOWN',
          detail: 'Service is restarting. Please retry.',
        });
      return;
    }
    this.activeRequests++;
    // A client disconnect does not cancel the handler. Track handler completion
    // separately through the interceptor, including its pending database work.
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.activeRequests--;
      if (!this.activeRequests) this.requestDrained?.();
    };
    response.locals.finishRequest = finish;
    response.once('finish', finish);
    // Requests rejected by guards/middleware never reach the interceptor.
    response.once('close', () => {
      if (
        !response.locals.activeGuards &&
        (!response.locals.handlerStarted || response.locals.handlerCompleted)
      )
        finish();
    });
    next();
  };

  drain(): Promise<void> {
    if (this.draining) return this.draining;
    this.isDraining = true;
    this.logger.log({ event: 'shutdown.draining' });
    this.draining = this.waitForWork();
    return this.draining;
  }

  private async waitForWork(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const requests = new Promise<void>((resolve) => {
        this.requestDrained = resolve;
        if (!this.activeRequests) resolve();
      });
      await Promise.race([
        Promise.all([
          requests,
          ...Array.from(this.participants.values(), (stop) =>
            Promise.resolve().then(stop),
          ),
        ]),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Shutdown drain deadline exceeded')),
            this.environment.shutdownTimeoutMs,
          );
        }),
      ]);
      this.logger.log({ event: 'shutdown.drained' });
    } catch (error) {
      // Do not close dependencies beneath still-running work. Nest's signal
      // handler exits with failure; PostgreSQL rolls back and durable jobs recover.
      this.logger.error({
        event: 'shutdown.deadline_exceeded',
        activeRequests: this.activeRequests,
      });
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.drain();
  }
}
