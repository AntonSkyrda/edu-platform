import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { EnvironmentService } from '../../config/environment.service';

type Waiter = { grant: () => void; cancel: () => void };
@Injectable()
export class MediaAdmissionService {
  private active = 0;
  private readonly waiting: Waiter[] = [];
  constructor(private readonly environment: EnvironmentService) {}

  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(this.unavailable());
    if (this.active < this.environment.mediaMaxConcurrent) {
      this.active++;
      return Promise.resolve(this.releaseOnce());
    }
    if (this.waiting.length >= this.environment.mediaMaxWaiting)
      return Promise.reject(this.unavailable());
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', waiter.cancel);
        const index = this.waiting.indexOf(waiter);
        if (index >= 0) this.waiting.splice(index, 1);
      };
      const waiter: Waiter = {
        grant: () => {
          cleanup();
          this.active++;
          resolve(this.releaseOnce());
        },
        cancel: () => {
          cleanup();
          reject(this.unavailable());
        },
      };
      const timer = setTimeout(
        waiter.cancel,
        this.environment.mediaWaitTimeoutMs,
      );
      this.waiting.push(waiter);
      signal.addEventListener('abort', waiter.cancel, { once: true });
    });
  }
  private unavailable() {
    return new ServiceUnavailableException({
      code: 'MEDIA_BUSY',
      message: 'File processing is busy. Please retry shortly.',
    });
  }
  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.waiting[0]?.grant();
    };
  }
}
