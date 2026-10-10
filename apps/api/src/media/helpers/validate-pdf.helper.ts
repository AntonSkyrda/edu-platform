import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
export function validatePdf(
  body: Buffer,
  maxPages: number,
  timeoutMs: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      join(__dirname, '../workers/pdf-validation.worker.js'),
      {
        workerData: { body, maxPages },
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 32,
        },
      },
    );
    const finish = (pages?: number) => {
      clearTimeout(timer);
      void worker.terminate();
      if (pages) resolve(pages);
      else reject(new Error('Invalid or resource-intensive PDF'));
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    worker.once('message', (value) =>
      finish(typeof value === 'number' && value > 0 ? value : undefined),
    );
    worker.once('error', () => finish());
    worker.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('PDF validation worker exited'));
    });
  });
}
