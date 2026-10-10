import type { MediaKind } from '@project/contracts';
export interface ProcessedMedia {
  kind: MediaKind;
  body: Buffer;
  mimeType: string;
  extension: 'webp' | 'pdf';
  width?: number;
  height?: number;
  pageCount?: number;
}
