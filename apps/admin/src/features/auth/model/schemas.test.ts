import { expect, it } from 'vitest';

import { passwordSchema } from './schemas';
it('validates both password limits and confirmation', () => {
  expect(
    passwordSchema.safeParse({
      password: '12345678',
      confirmPassword: '12345678',
    }).success,
  ).toBe(true);
  for (const password of ['1234567', 'a'.repeat(65)])
    expect(
      passwordSchema.safeParse({ password, confirmPassword: password }).success,
    ).toBe(false);
  expect(
    passwordSchema.safeParse({
      password: '12345678',
      confirmPassword: 'different',
    }).success,
  ).toBe(false);
});
