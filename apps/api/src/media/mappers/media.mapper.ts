import type { MediaResponse } from '@project/contracts';
import type { Media } from '@project/database/types';
export function toMedia(value: Media): MediaResponse {
  return {
    id: value.id,
    kind: value.kind,
    mimeType: value.mimeType,
    size: value.size,
    width: value.width,
    height: value.height,
    pageCount: value.pageCount,
    previewUrl: `/admin/media/${value.id}/content`,
    createdAt: value.createdAt.toISOString(),
  };
}
