import {
  apiURL,
  expect,
  frontendURL,
  login,
  anonymousTest as test,
} from './fixtures';

test('real login, HttpOnly cookies, session refresh and server-side logout', async ({
  page,
  context,
}) => {
  await login(page, 'login');
  const before = await context.cookies(`${apiURL}/auth`);
  expect(
    before.find((cookie) => cookie.name === 'access_token')?.httpOnly,
  ).toBe(true);
  const refresh = before.find((cookie) => cookie.name === 'refresh_token');
  expect(refresh?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toMatch(
    /access_token|refresh_token/,
  );
  expect(
    await page.evaluate(() => ({ ...localStorage, ...sessionStorage })),
  ).toEqual({});

  await context.clearCookies({ name: 'access_token' });
  const refreshed = page.waitForResponse(
    (response) =>
      response.url() === `${apiURL}/auth/refresh` &&
      response.request().method() === 'POST',
  );
  await page.reload();
  expect((await refreshed).status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'Вітаємо, login' }),
  ).toBeVisible();
  const cookies = await context.cookies(`${apiURL}/auth`);
  expect(
    cookies.find((cookie) => cookie.name === 'refresh_token')?.value,
  ).not.toBe(refresh?.value);
  const revokedToken = cookies.find(
    (cookie) => cookie.name === 'refresh_token',
  )!.value;

  await page.getByRole('button', { name: 'Вийти', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (await context.cookies(`${apiURL}/auth`)).filter((cookie) =>
      ['access_token', 'refresh_token'].includes(cookie.name),
    ),
  ).toEqual([]);
  const replay = await context.request.post(`${apiURL}/auth/refresh`, {
    headers: { Origin: frontendURL, Cookie: `refresh_token=${revokedToken}` },
  });
  expect(replay.status()).toBe(401);
  await page.goto('/subjects');
  await expect(page).toHaveURL(/\/login$/);
});

test('manager read-only permissions apply in the UI and the API', async ({
  page,
  context,
}) => {
  await login(page, 'reader');
  await page.goto('/subjects');
  await expect(
    page.getByRole('heading', { name: 'Напрями', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Додати напрям' })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('link', { name: 'Користувачі', exact: true }),
  ).toHaveCount(0);
  const denied = await context.request.post(`${apiURL}/admin/subjects`, {
    headers: { Origin: frontendURL },
    data: { name: 'Forbidden subject', sortOrder: 0 },
  });
  expect(denied.status()).toBe(403);
  const users = await context.request.get(`${apiURL}/auth/users`);
  expect(users.status()).toBe(403);
  await page.goto('/users');
  await expect(page).toHaveURL(`${frontendURL}/`);
});
