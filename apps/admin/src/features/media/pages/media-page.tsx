import type { MediaResponse } from '@project/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { usePermissions } from '@/features/auth';
import { Button } from '@/shared/ui/button';
import { ErrorNotice, SuccessNotice } from '@/shared/ui/feedback';
import { FormField } from '@/shared/ui/form-field';

import { mediaApi } from '../api/media-api';
import { FileUpload } from '../components/file-upload';
import { ImagePreview } from '../components/image-preview';
export function MediaPage() {
  const can = usePermissions();
  const client = useQueryClient();
  const [files, setFiles] = useState<MediaResponse[]>([]);
  const [id, setId] = useState('');
  const remember = (file: MediaResponse) =>
    setFiles((current) => [
      file,
      ...current.filter((item) => item.id !== file.id),
    ]);
  const lookup = useMutation({
    mutationFn: () => mediaApi.get(id.trim()),
    onSuccess: remember,
  });
  const remove = useMutation({
    mutationFn: mediaApi.remove,
    onSuccess: (_, removedId) => {
      setFiles((current) => current.filter((file) => file.id !== removedId));
      client.removeQueries({ queryKey: ['media-content', removedId] });
    },
  });
  const download = useMutation({
    mutationFn: async (file: MediaResponse) => {
      const blob = await mediaApi.content(file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${file.id}.${file.kind === 'PDF' ? 'pdf' : 'webp'}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  if (!can('media.read') && !can('media.upload') && !can('media.delete'))
    return <p role="alert">Немає доступу до файлів.</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Матеріали сайту</p>
        <h1 className="mt-2 text-3xl font-semibold">Файли</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Фото й PDF зберігаються приватно. Неприкріплені файли очищаються
          автоматично; PDF поки можна завантажити для перевірки, але ще немає
          розділу для їх постійного прикріплення.
        </p>
      </header>
      {can('media.upload') && (
        <section className="grid gap-6 rounded-xl border bg-white p-6 sm:grid-cols-2">
          <FileUpload kind="IMAGE" onUploaded={remember} />
          <FileUpload kind="PDF" onUploaded={remember} />
        </section>
      )}
      {(can('media.read') || can('media.delete')) && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (can('media.read') && z.uuid().safeParse(id.trim()).success)
              lookup.mutate();
          }}
        >
          <div className="min-w-0 flex-1">
            <FormField
              id="media-id"
              label="ID файлу"
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder="ID завантаженого файлу"
            />
          </div>
          {can('media.read') && (
            <Button
              disabled={
                !z.uuid().safeParse(id.trim()).success || lookup.isPending
              }
            >
              Знайти
            </Button>
          )}
          {can('media.delete') && !can('media.read') && (
            <Button
              type="button"
              variant="outline"
              disabled={
                !z.uuid().safeParse(id.trim()).success || remove.isPending
              }
              onClick={() => {
                if (window.confirm('Видалити файл за вказаним ID назавжди?'))
                  remove.mutate(id.trim());
              }}
            >
              Видалити за ID
            </Button>
          )}
        </form>
      )}
      <ErrorNotice error={lookup.error || remove.error || download.error} />
      {remove.isSuccess && (
        <SuccessNotice>Файл поставлено в чергу на видалення.</SuccessNotice>
      )}
      <section className="space-y-4">
        <h2 className="font-semibold">Файли, відкриті на цій сторінці</h2>
        {files.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Завантажте файл або знайдіть його за ID.
          </p>
        )}
        {files.map((file) => (
          <article
            key={file.id}
            className="space-y-3 rounded-xl border bg-white p-5"
          >
            {file.kind === 'IMAGE' && can('media.read') && (
              <ImagePreview id={file.id} />
            )}
            <h3 className="font-medium">
              {file.kind === 'IMAGE' ? 'Зображення' : 'PDF-документ'}
            </h3>
            <p className="break-all text-sm">ID: {file.id}</p>
            <p className="text-sm text-muted-foreground">
              {Math.ceil(file.size / 1024)} КБ
              {file.pageCount ? ` · ${file.pageCount} стор.` : ''}
            </p>
            <div className="flex gap-3">
              {can('media.read') && (
                <Button
                  variant="outline"
                  disabled={download.isPending}
                  onClick={() => download.mutate(file)}
                >
                  Завантажити файл
                </Button>
              )}
              {can('media.delete') && (
                <Button
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Видалити файл назавжди? Прикріплені файли видалити не можна.',
                      )
                    )
                      remove.mutate(file.id);
                  }}
                >
                  Видалити файл
                </Button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
