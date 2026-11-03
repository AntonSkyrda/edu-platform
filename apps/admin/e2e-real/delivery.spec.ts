import { apiURL, expect, test } from './fixtures';

test('delivery states and retry use the real API without exposing invitation secrets', async ({
  page,
  context,
}) => {
  await page.goto('/users');
  const status = page.getByRole('region', { name: 'Стан доставки листів' });
  await expect(
    status.getByText('Доставка листів потребує уваги'),
  ).toBeVisible();
  const failed = page
    .getByRole('row')
    .filter({ hasText: 'mail-failed@admin-e2e.test' });
  await expect(
    failed.getByText('Не вдалося надіслати', { exact: true }),
  ).toBeVisible();
  const sent = page
    .getByRole('row')
    .filter({ hasText: 'mail-sent@admin-e2e.test' });
  await expect(
    sent.getByText('Передано поштовому серверу', { exact: true }),
  ).toBeVisible();
  const response = await context.request.get(`${apiURL}/auth/users`);
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain('tokenHash');
  expect(JSON.stringify(body)).not.toContain('dispatchLeaseId');
  expect(
    body.detail.items.find(
      (user: { email: string }) => user.email === 'mail-failed@admin-e2e.test',
    ).invitation.attempts,
  ).toBe(5);
  page.once('dialog', (dialog) => dialog.accept());
  await failed
    .getByRole('button', { name: 'Повторити лист', exact: true })
    .click();
  await expect(
    page.getByText(
      'Нове запрошення збережено. Стан доставки оновиться автоматично.',
    ),
  ).toBeVisible();
  await expect(
    failed.getByText('Очікує доставки', { exact: true }),
  ).toBeVisible();
});
