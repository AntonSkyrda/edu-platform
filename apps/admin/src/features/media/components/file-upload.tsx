import type { MediaKind, MediaResponse } from '@project/contracts';
import { useMutation } from '@tanstack/react-query';
import { useId } from 'react';

import { ErrorNotice } from '@/shared/ui/feedback';

import { mediaApi } from '../api/media-api';
export function FileUpload({
  kind,
  onUploaded,
  disabled = false,
  onBusy,
}: {
  kind: MediaKind;
  onUploaded: (file: MediaResponse) => void;
  disabled?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const id = useId();
  const upload = useMutation({
    mutationFn: (file: File) => mediaApi.upload(file, kind),
    onMutate: () => onBusy?.(true),
    onSuccess: onUploaded,
    onSettled: () => onBusy?.(false),
  });
  return (
    <div className="space-y-3">
      <label htmlFor={id} className="block text-sm font-medium">
        {kind === 'IMAGE'
          ? 'Завантажити фото (JPEG, PNG, WebP)'
          : 'Завантажити PDF'}
      </label>
      <input
        id={id}
        type="file"
        accept={
          kind === 'IMAGE'
            ? 'image/jpeg,image/png,image/webp'
            : 'application/pdf'
        }
        disabled={disabled || upload.isPending}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:bg-white file:px-3 file:py-2"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
          event.target.value = '';
        }}
      />
      {upload.isPending && <p role="status">Завантаження…</p>}
      <ErrorNotice error={upload.error} />
    </div>
  );
}
