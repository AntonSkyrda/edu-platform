import { expect, type Page, test } from '@playwright/test';
const admin = {
  id: '1',
  email: 'admin@example.test',
  firstName: 'Anton',
  lastName: 'Test',
  role: 'ADMIN',
  status: 'ACTIVE',
};
async function mockApi(
  page: Page,
  role = 'ADMIN',
  initialSession = false,
  refreshAvailable = false,
) {
  let signedIn = initialSession;
  let refreshes = 0;
  await page.route('http://localhost:3000/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const headers = {
      'access-control-allow-origin': 'http://localhost:4173',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let status = 200;
    let detail: unknown = { message: 'OK' };
    if (path === '/auth/me') {
      status = signedIn ? 200 : 401;
      detail = signedIn ? { ...admin, role } : 'Unauthorized';
    } else if (path === '/auth/refresh') {
      refreshes++;
      signedIn = refreshAvailable;
      status = refreshAvailable ? 200 : 401;
      detail = refreshAvailable
        ? { expiresIn: 900, user: { ...admin, role } }
        : 'Expired';
    } else if (path === '/auth/login') {
      signedIn = true;
      detail = { expiresIn: 900, user: { ...admin, role } };
    } else if (path === '/auth/logout') {
      signedIn = false;
    } else if (path === '/auth/users')
      detail = {
        items: [
          admin,
          {
            ...admin,
            id: '2',
            email: 'manager@example.test',
            role: 'MANAGER',
            status: 'INVITED',
          },
        ],
        hasMore: false,
      };
    else if (path === '/auth/invitations')
      detail = {
        ...admin,
        ...route.request().postDataJSON(),
        id: '3',
        status: 'INVITED',
      };
    await route.fulfill({
      status,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        status_code: status,
        result: status === 200 ? 'success' : 'error',
        detail,
      }),
    });
  });
  return {
    refreshes: () => refreshes,
    expire: () => {
      signedIn = false;
    },
  };
}
test('redirects guest, signs in, lists users and signs out', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
  expect(state.refreshes()).toBe(1);
  await page.screenshot({ path: '/tmp/edu-admin-login.png', fullPage: true });
  await page.getByLabel('Email', { exact: true }).fill(admin.email);
  await page.getByLabel('Пароль', { exact: true }).fill('12345678');
  await page.getByRole('button', { name: 'Увійти', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Вітаємо, Anton' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Користувачі', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Користувачі', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('manager@example.test', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: '/tmp/edu-admin-users.png', fullPage: true });
  await page.getByRole('button', { name: 'Вийти', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
test('manager cannot open user management', async ({ page }) => {
  await mockApi(page, 'MANAGER', true);
  await page.goto('/users');
  await expect(page).toHaveURL('http://localhost:4173/');
  await expect(
    page.getByRole('link', { name: 'Користувачі', exact: true }),
  ).toHaveCount(0);
});
test('student is denied admin access', async ({ page }) => {
  await mockApi(page, 'STUDENT', true);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Немає доступу до адмінки' }),
  ).toBeVisible();
});
test('accepts invitation, removes token from URL and validates confirmation', async ({
  page,
}) => {
  await mockApi(page);
  let submitted = '';
  await page.route('**/auth/invitations/accept', async (route) => {
    if (route.request().method() === 'POST')
      submitted = route.request().postDataJSON().token;
    await route.fallback();
  });
  const token = 'a'.repeat(64);
  await page.goto(`/accept-invitation#token=${token}`);
  await expect(page).toHaveURL('http://localhost:4173/accept-invitation');
  await page
    .getByLabel('Пароль (8–64 символи)', { exact: true })
    .fill('12345678');
  await page.getByLabel('Повторіть пароль').fill('different');
  await page
    .getByRole('button', { name: 'Активувати обліковий запис' })
    .click();
  await expect(page.getByText('Паролі не збігаються')).toBeVisible();
  expect(submitted).toBe('');
  await page.getByLabel('Повторіть пароль').fill('12345678');
  await page
    .getByRole('button', { name: 'Активувати обліковий запис' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Обліковий запис активовано',
  );
  expect(submitted).toBe(token);
});
test('password recovery stays generic and works on a mobile viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill('unknown@example.test');
  await page.getByRole('button', { name: 'Відновити пароль' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Якщо для цього email доступне відновлення',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('missing reset token shows actionable message', async ({ page }) => {
  await mockApi(page);
  await page.goto('/reset-password');
  await expect(page.getByRole('alert')).toContainText('Посилання неповне');
  await expect(
    page.getByRole('button', { name: 'Змінити пароль' }),
  ).toHaveCount(0);
});
test('server unavailable shows retry without pretending to log out', async ({
  page,
}) => {
  await page.route('http://localhost:3000/**', (route) =>
    route.abort('failed'),
  );
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Спробувати ще раз' }),
  ).toBeVisible();
  await mockApi(page, 'ADMIN', true);
  await page.getByRole('button', { name: 'Спробувати ще раз' }).click();
  await expect(
    page.getByRole('heading', { name: 'Вітаємо, Anton' }),
  ).toBeVisible();
});

test('restores expired access using the refresh cookie', async ({ page }) => {
  const state = await mockApi(page, 'ADMIN', false, true);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Вітаємо, Anton' }),
  ).toBeVisible();
  expect(state.refreshes()).toBe(1);
});
test('sets a new recovery password and offers login without automatic sign-in', async ({
  page,
}) => {
  await mockApi(page);
  let submitted: unknown;
  await page.route('**/auth/reset-password', async (route) => {
    if (route.request().method() === 'POST')
      submitted = route.request().postDataJSON();
    await route.fallback();
  });
  await page.goto('/reset-password#token=' + 'b'.repeat(64));
  await page
    .getByLabel('Пароль (8–64 символи)', { exact: true })
    .fill('new-password');
  await page.getByLabel('Повторіть пароль').fill('new-password');
  await page.getByRole('button', { name: 'Змінити пароль' }).click();
  await expect(page.getByRole('status')).toContainText('Пароль змінено');
  expect(submitted).toEqual({
    token: 'b'.repeat(64),
    password: 'new-password',
  });
  await page.getByRole('link', { name: 'Перейти до входу' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
test('failed login does not refresh, and failed logout retains the session UI', async ({
  page,
}) => {
  const state = await mockApi(page, 'ADMIN', true);
  await page.route('**/auth/login', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': 'http://localhost:4173',
        'access-control-allow-credentials': 'true',
      },
      body: JSON.stringify({ detail: 'Invalid email or password' }),
    }),
  );
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(admin.email);
  await page.getByLabel('Пароль', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Увійти', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(state.refreshes()).toBe(0);
  await page.goto('/');
  await page.route('**/auth/logout', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Вийти', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Вітаємо, Anton' }),
  ).toBeVisible();
});
test('admin can invite, resend, block and unblock with explicit confirmation', async ({
  page,
}) => {
  await mockApi(page, 'ADMIN', true);
  const actions: string[] = [];
  await page.route('http://localhost:3000/**', async (route) => {
    if (route.request().method() === 'POST')
      actions.push(new URL(route.request().url()).pathname);
    await route.fallback();
  });
  await page.goto('/users');
  await page.getByLabel('Ім’я', { exact: true }).fill('New');
  await page.getByLabel('Прізвище').fill('Manager');
  await page.getByLabel('Email', { exact: true }).fill('new@example.test');
  await page
    .getByRole('button', { name: 'Надіслати запрошення', exact: true })
    .click();
  await expect(
    page.getByText(
      'Запрошення створено, лист поставлено в чергу. Це ще не підтвердження доставки.',
    ),
  ).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Повторити лист' }).click();
  await expect(page.getByText('Новий лист поставлено в чергу.')).toBeVisible();
  await page.getByRole('button', { name: 'Заблокувати', exact: true }).click();
  await expect(
    page.getByText('Користувача заблоковано.', { exact: true }),
  ).toBeVisible();
  await page.route('**/auth/users?*', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': 'http://localhost:4173',
        'access-control-allow-credentials': 'true',
      },
      contentType: 'application/json',
      body: JSON.stringify({
        detail: {
          items: [{ ...admin, id: '2', role: 'MANAGER', status: 'BLOCKED' }],
          hasMore: false,
        },
      }),
    }),
  );
  await page.getByRole('button', { name: 'Оновити', exact: true }).click();
  await page.getByRole('button', { name: 'Розблокувати', exact: true }).click();
  await expect(
    page.getByText('Доступ відновлено.', { exact: false }),
  ).toBeVisible();
  expect(actions).toEqual([
    '/auth/invitations',
    '/auth/invitations/2/resend',
    '/auth/users/2/block',
    '/auth/users/2/unblock',
  ]);
});
