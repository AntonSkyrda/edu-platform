import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@project/contracts';
import { z } from 'zod';
export const emailSchema = z
  .string()
  .trim()
  .email('Вкажіть коректний email')
  .max(254);
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Введіть пароль').max(128),
});
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Щонайменше ${PASSWORD_MIN_LENGTH} символів`)
      .max(PASSWORD_MAX_LENGTH, `Не більше ${PASSWORD_MAX_LENGTH} символів`),
    confirmPassword: z.string().min(1, 'Повторіть пароль'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Паролі не збігаються',
    path: ['confirmPassword'],
  });
