import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { Button } from '@/shared/ui/button';
import { ErrorNotice, SuccessNotice } from '@/shared/ui/feedback';
import { FormField } from '@/shared/ui/form-field';

import { authApi } from '../api/auth-api';
import { AuthCard } from '../components/auth-card';
import { forgotPasswordSchema } from '../model/schemas';
export function ForgotPasswordPage() {
  const mutation = useMutation({ mutationFn: authApi.forgotPassword });
  const form = useForm({
    defaultValues: { email: '' },
    validators: { onSubmit: forgotPasswordSchema },
    onSubmit: async ({ value }) => {
      await mutation
        .mutateAsync(forgotPasswordSchema.parse(value).email)
        .catch(() => undefined);
    },
  });
  return (
    <AuthCard
      title="Забули пароль?"
      description="Надішлемо посилання для встановлення нового пароля."
    >
      {mutation.isSuccess ? (
        <SuccessNotice>
          Якщо для цього email доступне відновлення, ви отримаєте лист.
          Перевірте також папку «Спам».
        </SuccessNotice>
      ) : (
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
                autoComplete="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
          <ErrorNotice error={mutation.error} />
          <Button
            className="h-11 w-full"
            type="submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Надсилаємо…' : 'Відновити пароль'}
          </Button>
        </form>
      )}
      <Link
        className="mt-6 block text-center text-sm underline underline-offset-4"
        to="/login"
      >
        Повернутися до входу
      </Link>
    </AuthCard>
  );
}
