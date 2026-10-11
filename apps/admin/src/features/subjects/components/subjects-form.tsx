import type { SubjectResponse } from '@project/contracts';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { usePermissions } from '@/features/auth';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/feedback';
import { FormField } from '@/shared/ui/form-field';

import { subjectsApi } from '../api/subjects-api';
import { subjectSchema } from '../model/schema';
export function SubjectForm({
  initial,
  onSaved,
  onClose,
}: {
  initial?: SubjectResponse;
  onSaved: (value: SubjectResponse) => void;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const can = usePermissions();
  const allowed = initial
    ? can('subjects.update') &&
      (initial.status !== 'PUBLISHED' || can('subjects.publish'))
    : can('subjects.create');
  const save = useMutation({
    mutationFn: (data: Parameters<typeof subjectsApi.save>[0]) =>
      subjectsApi.save(data, initial?.id),
    onSuccess: (value) => {
      void client.invalidateQueries({ queryKey: ['subjects'] });
      onSaved(value);
    },
  });
  const form = useForm({
    defaultValues: {
      name: initial?.name ?? '',
      sortOrder: initial?.sortOrder ?? 0,
    },
    validators: { onSubmit: subjectSchema },
    onSubmit: async ({ value }) => {
      if (!allowed) return;
      const data = subjectSchema.parse(value);
      await save.mutateAsync(data).catch(() => undefined);
    },
  });
  return (
    <section className="rounded-xl border bg-white p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">
          {initial ? 'Редагування' : 'Створення'} напряму
        </h2>
        <Button
          variant="ghost"
          disabled={save.isPending}
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
          <form.Field name="name">
            {(f) => (
              <FormField
                id="subjects-name"
                label="Назва"
                value={f.state.value}
                onBlur={f.handleBlur}
                onChange={(e) => f.handleChange(e.target.value)}
                errors={f.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="sortOrder">
            {(f) => (
              <FormField
                id="subject-order"
                label="Порядок відображення"
                type="number"
                min={0}
                max={2147483647}
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.valueAsNumber)}
                errors={f.state.meta.errors}
              />
            )}
          </form.Field>
          <ErrorNotice error={save.error} />
          <Button type="submit" disabled={!allowed || save.isPending}>
            {save.isPending ? 'Зберігаємо…' : 'Зберегти'}
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
