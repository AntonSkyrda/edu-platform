import { INVITABLE_ROLES, type InviteUserRequest } from '@project/contracts';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/shared/ui/button';
import { ErrorNotice, SuccessNotice } from '@/shared/ui/feedback';
import { FormField } from '@/shared/ui/form-field';

import { usersApi } from '../api/users-api';
import { inviteSchema, roleLabels } from '../model/schemas';
export function InviteForm() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: usersApi.invite,
    onSuccess: () => {
      form.reset();
      void client.invalidateQueries({ queryKey: ['users'] });
    },
  });
  const form = useForm({
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      role: 'MANAGER',
    } as InviteUserRequest,
    validators: { onSubmit: inviteSchema },
    onSubmit: async ({ value }) => {
      await mutation
        .mutateAsync(inviteSchema.parse(value))
        .catch(() => undefined);
    },
  });
  return (
    <section className="rounded-xl border bg-white p-6">
      <h2 className="mb-5 text-lg font-semibold">Запросити учасника</h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="firstName">
            {(f) => (
              <FormField
                id="firstName"
                label="Ім’я"
                autoComplete="given-name"
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
                id="lastName"
                label="Прізвище"
                autoComplete="family-name"
                value={f.state.value}
                onBlur={f.handleBlur}
                onChange={(e) => f.handleChange(e.target.value)}
                errors={f.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="email">
            {(f) => (
              <FormField
                id="invite-email"
                label="Email"
                type="email"
                autoComplete="email"
                value={f.state.value}
                onBlur={f.handleBlur}
                onChange={(e) => f.handleChange(e.target.value)}
                errors={f.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="role">
            {(f) => (
              <div className="space-y-2">
                <label htmlFor="role" className="text-sm font-medium">
                  Роль
                </label>
                <select
                  id="role"
                  className="h-11 w-full rounded-lg border bg-white px-3 text-sm"
                  value={f.state.value}
                  onBlur={f.handleBlur}
                  onChange={(e) => {
                    const role = INVITABLE_ROLES.find(
                      (role) => role === e.target.value,
                    );
                    if (role) f.handleChange(role);
                  }}
                >
                  {INVITABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form.Field>
        </div>
        <ErrorNotice error={mutation.error} />
        {mutation.isSuccess && (
          <SuccessNotice>
            Запрошення збережено. Стан доставки листа відображається в списку
            учасників.
          </SuccessNotice>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Створюємо…' : 'Надіслати запрошення'}
        </Button>
      </form>
    </section>
  );
}
