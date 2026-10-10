import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';

import { advanceSessionVersion } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/feedback';
import { FormField } from '@/shared/ui/form-field';

import { authApi } from '../api/auth-api';
import { AuthCard } from '../components/auth-card';
import { loginSchema } from '../model/schemas';
import { sessionOptions } from '../model/session';
export function LoginPage() {
  const client = useQueryClient();
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: async () => {
      await client.cancelQueries();
      client.clear();
      advanceSessionVersion();
      await client.fetchQuery(sessionOptions);
      await router.invalidate();
      await router.navigate({ to: '/' });
    },
  });
  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      await mutation
        .mutateAsync(loginSchema.parse(value))
        .catch(() => undefined);
    },
  });
  return (
    <AuthCard
      title="Вхід до адмінки"
      description="Використайте обліковий запис, який запросив адміністратор."
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="email">
          {(field) => (
            <FormField
              id="email"
              label="Email"
              type="email"
              autoComplete="username"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <FormField
              id="password"
              label="Пароль"
              type="password"
              autoComplete="current-password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <ErrorNotice error={mutation.error} />
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Входимо…' : 'Увійти'}
        </Button>
        <Link
          to="/forgot-password"
          className="block text-center text-sm underline underline-offset-4"
        >
          Забули пароль?
        </Link>
      </form>
      <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
        Реєстрація відкрита лише за запрошенням.
      </p>
    </AuthCard>
  );
}
