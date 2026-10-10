import { parentPort, workerData } from 'node:worker_threads';

import { PDFDocument } from 'pdf-lib';
const { body, maxPages } = workerData as { body: Uint8Array; maxPages: number };
void PDFDocument.load(body, {
  ignoreEncryption: false,
  updateMetadata: false,
  throwOnInvalidObject: true,
})
  .then((document) => {
    const pages = document.getPageCount();
    if (document.isEncrypted || pages < 1 || pages > maxPages)
      throw new Error('Unsupported PDF');
    parentPort?.postMessage(pages);
  })
  .catch(() => parentPort?.postMessage(null));
