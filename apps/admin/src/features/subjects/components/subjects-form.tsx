import type { SubjectResponse } from '@project/contracts';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { usePermissions } from '@/features/auth';
import {
  isVersionConflict,
  useEditConflict,
} from '@/shared/lib/use-edit-conflict';
import { Button } from '@/shared/ui/button';
import { EditConflictNotice } from '@/shared/ui/edit-conflict-notice';
import { ErrorNotice } from '@/shared/ui/feedback';
import { FormField } from '@/shared/ui/form-field';

import { subjectsApi } from '../api/subjects-api';
import { subjectSchema } from '../model/schema';
const editValues = (record: SubjectResponse) => ({
  name: record.name,
  sortOrder: record.sortOrder,
});
const fieldLabels = { name: 'Назва', sortOrder: 'Порядок відображення' };

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
  const conflict = useEditConflict(
    initial,
    () => subjectsApi.get(initial!.id),
    editValues,
  );
  const current = conflict.record;
  const allowed = initial
    ? can('subjects.update') &&
      (current?.status !== 'PUBLISHED' || can('subjects.publish'))
    : can('subjects.create');
  const save = useMutation({
    mutationFn: (data: Parameters<typeof subjectsApi.save>[0]) =>
      subjectsApi.save(data, current),
    onError: conflict.capture,
    onSuccess: (value) => {
      conflict.accept(value);
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
      if (!allowed || conflict.blocked) return;
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
          disabled={save.isPending || conflict.pending}
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
        <EditConflictNotice
          {...conflict}
          onReview={() =>
            void conflict.review(form.state.values, (values) => {
              for (const key of Object.keys(values) as (keyof typeof values)[])
                form.setFieldValue(key, values[key]);
            })
          }
          fields={conflict.fields.map((key) => ({
            key,
            label: fieldLabels[key],
            local: String(form.state.values[key] ?? '—'),
            remote: String(conflict.remote?.[key] ?? '—'),
            choose: (source) => {
              if (source === 'remote' && conflict.remote)
                form.setFieldValue(key, conflict.remote[key]);
              conflict.resolve(key);
            },
          }))}
        />
        <fieldset
          disabled={
            !allowed ||
            save.isPending ||
            conflict.pending ||
            conflict.fields.length > 0
          }
          className="space-y-4"
        >
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
          <ErrorNotice
            error={isVersionConflict(save.error) ? undefined : save.error}
          />
          <Button
            type="submit"
            disabled={!allowed || save.isPending || conflict.blocked}
          >
            {save.isPending ? 'Зберігаємо…' : 'Зберегти'}
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
