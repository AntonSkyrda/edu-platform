export const MEDIA_KINDS = ['IMAGE', 'PDF'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export interface MediaResponse {
  id: string;
  kind: MediaKind;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  pageCount: number | null;
  previewUrl: string;
  createdAt: string;
}
