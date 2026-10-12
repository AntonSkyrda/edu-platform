import { createHash } from 'node:crypto';

import {
  test as base,
  type BrowserContext,
  expect,
  type Page,
} from '@playwright/test';

export const apiURL = 'http://127.0.0.1:3101';
export const frontendURL = 'http://127.0.0.1:4174';
export const password = 'E2e-only-password-123!';
type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

// Each scenario represents a separate client behind the local trusted proxy.
// Real Redis counters and the production limits remain enabled.
export function clientHeaders(identity: string) {
  const bytes = createHash('sha256').update(identity).digest();
  return { 'X-Forwarded-For': `198.18.${bytes[0]}.${bytes[1]}` };
}

export const anonymousTest = base.extend({
  extraHTTPHeaders: async ({ browserName }, use, testInfo) => {
    await use(clientHeaders(`${browserName}:${testInfo.testId}`));
  },
});

// Authenticate once through the real API. Tests get separate contexts; the login/
// refresh/logout scenario uses its own account and never rotates these cookies.
export const test = anonymousTest.extend<object, { adminState: StorageState }>({
  adminState: [
    async ({ playwright }, use, workerInfo) => {
      const request = await playwright.request.newContext({
        extraHTTPHeaders: {
          Origin: frontendURL,
          ...clientHeaders(`admin-login:${workerInfo.workerIndex}`),
        },
      });
      try {
        const response = await request.post(`${apiURL}/auth/login`, {
          data: { email: 'admin@admin-e2e.test', password },
        });
        expect(response.status()).toBe(200);
        await use(await request.storageState());
      } finally {
        await request.dispose();
      }
    },
    { scope: 'worker' },
  ],
  storageState: ({ adminState }, use) => use(adminState),
});
export { expect };

export async function login(page: Page, account: 'login' | 'reader') {
  await page.goto('/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`${account}@admin-e2e.test`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Увійти', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `Вітаємо, ${account}` }),
  ).toBeVisible();
}
export async function createSubject(page: Page, name: string) {
  await page.goto('/subjects');
  await page
    .getByRole('button', { name: 'Додати напрям', exact: true })
    .click();
  await page.getByLabel('Назва', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect(
    page.getByText('Зміни збережено.', { exact: true }),
  ).toBeVisible();
  return page.getByRole('row').filter({ hasText: name });
}
