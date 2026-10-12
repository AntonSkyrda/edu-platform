import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ErrorNotice } from '@/shared/ui/feedback';

import { mediaApi } from '../api/media-api';
export function ImagePreview({ id }: { id: string }) {
  const image = useQuery({
    queryKey: ['media-content', id],
    queryFn: ({ signal }) => mediaApi.content(id, signal),
  });
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!image.data) return;
    const objectUrl = URL.createObjectURL(image.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image.data]);
  return (
    <>
      <ErrorNotice error={image.error} />
      {image.isPending && <p role="status">Завантаження фото…</p>}
      {url && (
        <img
          src={url}
          alt="Фото викладача"
          className="h-40 w-40 rounded-xl object-cover"
        />
      )}
    </>
  );
}
