import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '@/shared/ui/button';
import { ErrorNotice, SuccessNotice } from '@/shared/ui/feedback';
import { FormField } from '@/shared/ui/form-field';

import { authApi } from '../api/auth-api';
import { AuthCard } from '../components/auth-card';
import { clearLinkToken, getLinkToken } from '../model/link-token';
import { passwordSchema } from '../model/schemas';
import { sessionKey } from '../model/session';
export function SetPasswordPage({ mode }: { mode: 'invitation' | 'recovery' }) {
  const [token] = useState(getLinkToken);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (password: string) =>
      authApi.setPassword(mode, token!, password),
    onSuccess: async () => {
      clearLinkToken();
      if (mode === 'recovery') {
        await client.cancelQueries();
        client.clear();
        client.setQueryData(sessionKey, null);
      }
    },
  });
  const form = useForm({
    defaultValues: { password: '', confirmPassword: '' },
    validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      if (token)
        await mutation.mutateAsync(value.password).catch(() => undefined);
    },
  });
  return (
    <AuthCard
      title={mode === 'invitation' ? 'Ласкаво просимо' : 'Новий пароль'}
      description={
        mode === 'invitation'
          ? 'Створіть пароль, щоб активувати ваш обліковий запис.'
          : 'Після зміни пароля потрібно буде увійти знову на всіх пристроях.'
      }
    >
      {mutation.isSuccess ? (
        <SuccessNotice>
          {mode === 'invitation'
            ? 'Обліковий запис активовано.'
            : 'Пароль змінено.'}{' '}
          Тепер ви можете увійти.
        </SuccessNotice>
      ) : !token ? (
        <ErrorNotice
          error={
            new Error(
              'Посилання неповне. Відкрийте його ще раз із листа. Якщо воно прострочене, запросіть нове.',
            )
          }
        />
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="password">
            {(field) => (
              <FormField
                id="password"
                label="Пароль (8–64 символи)"
                type="password"
                autoComplete="new-password"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="confirmPassword">
            {(field) => (
              <FormField
                id="confirm-password"
                label="Повторіть пароль"
                type="password"
                autoComplete="new-password"
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
            {mutation.isPending
              ? 'Зберігаємо…'
              : mode === 'invitation'
                ? 'Активувати обліковий запис'
                : 'Змінити пароль'}
          </Button>
        </form>
      )}
      <Link
        to="/login"
        className="mt-6 block text-center text-sm underline underline-offset-4"
      >
        Перейти до входу
      </Link>
      {mode === 'recovery' && (
        <Link
          to="/forgot-password"
          className="mt-4 block text-center text-sm text-muted-foreground underline"
        >
          Надіслати нове посилання
        </Link>
      )}
    </AuthCard>
  );
}
