import type { TeacherResponse } from '@project/contracts';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { usePermissions } from '@/features/auth';
import { FileUpload, ImagePreview } from '@/features/media';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/feedback';
import { FormField } from '@/shared/ui/form-field';
import { TextareaField } from '@/shared/ui/textarea-field';

import { teachersApi } from '../api/teachers-api';
import { teacherSchema } from '../model/schema';
export function TeacherForm({
  initial,
  onSaved,
  onClose,
}: {
  initial?: TeacherResponse;
  onSaved: (value: TeacherResponse) => void;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const can = usePermissions();
  const [uploading, setUploading] = useState(false);
  const allowed = initial
    ? can('teachers.update') &&
      (initial.status !== 'PUBLISHED' || can('teachers.publish'))
    : can('teachers.create');
  const save = useMutation({
    mutationFn: (data: Parameters<typeof teachersApi.save>[0]) =>
      teachersApi.save(data, initial?.id),
    onSuccess: (value) => {
      void client.invalidateQueries({ queryKey: ['teachers'] });
      onSaved(value);
    },
  });
  const form = useForm({
    defaultValues: {
      firstName: initial?.firstName ?? '',
      lastName: initial?.lastName ?? '',
      shortDescription: initial?.shortDescription ?? '',
      biography: initial?.biography ?? '',
      photoId: initial?.photoId ?? '',
    },
    validators: { onSubmit: teacherSchema },
    onSubmit: async ({ value }) => {
      if (!allowed || uploading) return;
      const data = teacherSchema.parse(value);
      await save
        .mutateAsync({ ...data, photoId: data.photoId || null })
        .catch(() => undefined);
    },
  });
  return (
    <section className="rounded-xl border bg-white p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">
          {initial ? 'Редагування' : 'Створення'} викладача
        </h2>
        <Button
          variant="ghost"
          disabled={save.isPending || uploading}
          onClick={() => {
            if (
              !form.state.isDirty ||
              window.confirm('Закрити форму без збереження змін?')
            )
              onClose();
          }}
        >
          Закрити
        </Button>
      </div>
      {!allowed && (
        <p role="alert" className="mb-4 text-sm">
          Немає прав на редагування цього запису. Для опублікованого запису
          потрібне право публікації.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <fieldset disabled={!allowed || save.isPending} className="space-y-4">
          <form.Field name="firstName">
            {(f) => (
              <FormField
                id="teachers-firstName"
                label="Ім’я"
                value={f.state.value}
                onBlur={f.handleBlur}
                onChange={(e) => f.handleChange(e.target.value)}
                errors={f.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="lastName">
            {(f) => (
              <FormField
                id="teachers-lastName"
                label="Прізвище"
                value={f.state.value}
                onBlur={f.handleBlur}
                onChange={(e) => f.handleChange(e.target.value)}
                errors={f.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="shortDescription">
            {(f) => (
              <TextareaField
                id="teachers-shortDescription"
                label="Короткий опис"
                value={f.state.value}
                onBlur={f.handleBlur}
                onChange={(e) => f.handleChange(e.target.value)}
                errors={f.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="biography">
            {(f) => (
              <TextareaField
                id="teachers-biography"
                label="Біографія"
                value={f.state.value}
                onBlur={f.handleBlur}
                onChange={(e) => f.handleChange(e.target.value)}
                errors={f.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="photoId">
            {(f) => (
              <div className="space-y-3">
                <p className="text-sm font-medium">Фото викладача</p>
                {f.state.value && can('media.read') && (
                  <ImagePreview key={f.state.value} id={f.state.value} />
                )}
                {f.state.value && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => f.handleChange('')}
                  >
                    Прибрати фото
                  </Button>
                )}
                {can('media.upload') ? (
                  <FileUpload
                    kind="IMAGE"
                    onBusy={setUploading}
                    onUploaded={(file) => f.handleChange(file.id)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Для завантаження фото потрібне окреме право.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Після завантаження збережіть викладача, щоб прикріпити фото.
                </p>
              </div>
            )}
          </form.Field>
          <ErrorNotice error={save.error} />
          <Button
            type="submit"
            disabled={!allowed || save.isPending || uploading}
          >
            {save.isPending ? 'Зберігаємо…' : 'Зберегти'}
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
