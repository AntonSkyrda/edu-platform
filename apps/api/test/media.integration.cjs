const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, rm, stat } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { test } = require('node:test');
require('reflect-metadata');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

const {
  LocalStorageAdapter,
} = require('../dist/infrastructure/storage/adapters/local-storage.adapter');
const {
  S3StorageAdapter,
} = require('../dist/infrastructure/storage/adapters/s3-storage.adapter');
const { ImageProcessor } = require('../dist/media/processors/image.processor');
const {
  MediaCleanupProcessor,
} = require('../dist/media/processors/media-cleanup.processor');
const { PdfProcessor } = require('../dist/media/processors/pdf.processor');
const {
  MediaCleanupScheduler,
} = require('../dist/media/services/media-cleanup-scheduler.service');
const settings = {
  mediaImageMaxBytes: 5 * 1024 * 1024,
  mediaPdfMaxBytes: 10 * 1024 * 1024,
  mediaImageMaxPixels: 20000000,
  mediaImageMaxDimension: 1600,
  mediaPdfMaxPages: 500,
  mediaPdfTimeoutMs: 5000,
};
const read = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};
test('images are decoded, resized and stripped of EXIF before storage', async () => {
  const source = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: '#ffccaa' },
  })
    .withMetadata()
    .jpeg()
    .toBuffer();
  assert((await sharp(source).metadata()).exif);
  const result = await new ImageProcessor(settings).process(source);
  const metadata = await sharp(result.body).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 800);
  assert.equal(metadata.exif, undefined);
  await assert.rejects(
    new ImageProcessor({ ...settings, mediaImageMaxPixels: 100 }).process(
      source,
    ),
    (error) => error.getStatus() === 400,
  );
  await assert.rejects(
    new ImageProcessor(settings).process(source.subarray(0, 50)),
    (error) => error.getStatus() === 400,
  );
});
test('PDF validation rejects malformed, empty and excessive-page documents', async () => {
  const document = await PDFDocument.create();
  document.addPage();
  document.addPage();
  const body = Buffer.from(await document.save());
  const result = await new PdfProcessor(settings).process(body);
  assert.equal(result.pageCount, 2);
  assert.deepEqual(result.body, body);
  await assert.rejects(
    new PdfProcessor({ ...settings, mediaPdfMaxPages: 1 }).process(body),
    (error) => error.getStatus() === 400,
  );
  await assert.rejects(
    new PdfProcessor(settings).process(Buffer.from('%PDF-1.7 fake %%EOF')),
    (error) => error.getStatus() === 400,
  );
  await assert.rejects(
    new PdfProcessor({ ...settings, mediaPdfTimeoutMs: 1 }).process(body),
    (error) => error.getStatus() === 400,
  );
});
test('local storage uses private files and rejects path traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'edu-storage-test-'));
  try {
    const storage = new LocalStorageAdapter({ storageLocalRoot: root });
    const key = `images/${randomUUID()}.webp`;
    const body = Buffer.from('test image');
    await storage.put(key, body);
    assert.deepEqual(await read(await storage.read(key)), body);
    assert.equal((await stat(join(root, key))).mode & 0o777, 0o600);
    await assert.rejects(
      storage.put('../outside', body),
      /Invalid storage object key/,
    );
    await assert.rejects(
      storage.read('/etc/passwd'),
      /Invalid storage object key/,
    );
    await storage.delete(key);
    await storage.delete(key);
    await assert.rejects(storage.read(key));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('S3 adapter keeps object operations private and returns a stream', async () => {
  const commands = [];
  const body = Buffer.from('pdf');
  const storage = new S3StorageAdapter({ s3Bucket: 'private-bucket' });
  storage.client = {
    send: async (command) => {
      commands.push(command);
      return { Body: Readable.from(body) };
    },
    destroy() {},
  };
  const key = `documents/${randomUUID()}.pdf`;
  await storage.put(key, body, 'application/pdf');
  assert.equal(commands[0].input.ACL, undefined);
  assert.equal(commands[0].input.CacheControl, 'private, no-store');
  assert.equal(commands[0].input.Bucket, 'private-bucket');
  assert.deepEqual(await read(await storage.read(key)), body);
  await storage.delete(key);
  assert.equal(commands[2].input.Key, key);
  storage.onModuleDestroy();
});
test('media cleanup is registered and executed through infrastructure queue', async () => {
  let scheduled;
  const queue = {
    schedule: async (...args) => {
      scheduled = args;
    },
  };
  const scheduler = new MediaCleanupScheduler(queue, {
    mediaCleanupIntervalMs: 60000,
  });
  scheduler.onModuleInit();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(scheduled, ['media', 'cleanup', 60000]);
  await scheduler.onModuleDestroy();
  let runs = 0;
  const processor = new MediaCleanupProcessor({
    run: async () => {
      runs++;
    },
  });
  await processor.process();
  assert.equal(runs, 1);
});
