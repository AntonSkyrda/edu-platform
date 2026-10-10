import type { Readable } from 'node:stream';

import { StreamableFile } from '@nestjs/common';
export function streamFile(content: {
  stream: Readable;
  mimeType: string;
  size: number;
  disposition: string;
}) {
  return new StreamableFile(content.stream, {
    type: content.mimeType,
    length: content.size,
    disposition: content.disposition,
  });
}
