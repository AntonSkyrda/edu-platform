import {
  apiURL,
  clientHeaders,
  expect,
  frontendURL,
  login,
  test,
} from './fixtures';

test('admin grants and revokes permissions for an already signed-in manager', async ({
  page,
  browser,
  context,
}, testInfo) => {
  const managerContext = await browser.newContext({
    baseURL: frontendURL,
    extraHTTPHeaders: clientHeaders(`${testInfo.testId}:manager`),
  });
  let permissionsURL: string | undefined;
  try {
    const manager = await managerContext.newPage();
    await login(manager, 'reader');
    await manager.getByRole('link', { name: 'Напрями', exact: true }).click();
    await expect(
      manager.getByRole('button', { name: 'Додати напрям' }),
    ).toHaveCount(0);
    await page.goto('/users');
    const loaded = page.waitForResponse(
      (response) =>
        response.url().endsWith('/permissions') &&
        response.request().method() === 'GET',
    );
    await page
      .getByRole('row')
      .filter({ hasText: 'reader@admin-e2e.test' })
      .getByRole('button', { name: 'Права', exact: true })
      .click();
    permissionsURL = (await loaded).url();
    await expect(
      page.getByLabel('Перегляд напрямів', { exact: true }),
    ).toBeChecked();
    await page.getByLabel('Створення напрямів', { exact: true }).check();
    await page.getByRole('button', { name: 'Зберегти права' }).click();
    await expect(page.getByText('Права збережено.')).toBeVisible();
    await manager.reload();
    await manager.getByRole('button', { name: 'Додати напрям' }).click();
    await manager
      .getByLabel('Назва', { exact: true })
      .fill('E2E granted permission');
    await manager
      .getByRole('button', { name: 'Зберегти', exact: true })
      .click();
    await expect(
      manager.getByText('Зміни збережено.', { exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Зняти всі позначки' }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Зберегти права' }).click();
    await expect(page.getByText('Права збережено.')).toBeVisible();
    // Existing cookies must not retain the revoked authority.
    const denied = await managerContext.request.post(
      `${apiURL}/admin/subjects`,
      {
        headers: { Origin: frontendURL },
        data: { name: 'E2E revoked permission', sortOrder: 0 },
      },
    );
    expect(denied.status()).toBe(403);
    await manager.reload();
    await expect(
      manager.getByRole('link', { name: 'Напрями', exact: true }),
    ).toHaveCount(0);
    await expect(
      manager.getByRole('button', { name: 'Додати напрям' }),
    ).toHaveCount(0);
  } finally {
    try {
      if (permissionsURL) {
        const latest = (
          await (await context.request.get(permissionsURL)).json()
        ).detail;
        const restored = await context.request.put(permissionsURL, {
          headers: { Origin: frontendURL },
          data: {
            permissions: ['subjects.read'],
            expectedVersion: latest.version,
          },
        });
        expect(restored.status()).toBe(200);
      }
    } finally {
      await managerContext.close();
    }
  }
});

test('two permissions editors preserve their choices on 409 without restoring revoked grants', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  let permissionsURL: string | undefined;
  try {
    const openPermissions = async (tab: typeof page) => {
      await tab.goto('/users');
      const loaded = tab.waitForResponse(
        (response) =>
          response.url().endsWith('/permissions') &&
          response.request().method() === 'GET',
      );
      await tab
        .getByRole('row')
        .filter({ hasText: 'reader@admin-e2e.test' })
        .getByRole('button', { name: 'Права', exact: true })
        .click();
      const response = await loaded;
      expect(response.status()).toBe(200);
      await expect(
        tab.getByLabel('Перегляд напрямів', { exact: true }),
      ).toBeChecked();
      return response.url();
    };
    permissionsURL = await openPermissions(page);
    await openPermissions(other);
    await page.getByLabel('Завантаження файлів', { exact: true }).check();
    await other.getByRole('button', { name: 'Зняти всі позначки' }).click();
    other.once('dialog', (dialog) => dialog.accept());
    await other.getByRole('button', { name: 'Зберегти права' }).click();
    await expect(other.getByText('Права збережено.')).toBeVisible();
    const conflict = page.waitForResponse(
      (response) =>
        response.url() === permissionsURL &&
        response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Зберегти права' }).click();
    expect((await conflict).status()).toBe(409);
    await expect(
      page.getByLabel('Перегляд напрямів', { exact: true }),
    ).toBeChecked();
    await expect(
      page.getByLabel('Завантаження файлів', { exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole('button', { name: 'Зберегти права' }),
    ).toBeDisabled();
    expect(
      (await (await context.request.get(permissionsURL)).json()).detail
        .permissions,
    ).toEqual([]);
    await page
      .getByRole('button', { name: 'Зіставити з актуальними даними' })
      .click();
    await page
      .getByRole('button', { name: 'Прийняти актуальне: Права доступу' })
      .click();
    await page.getByLabel('Перегляд викладачів', { exact: true }).check();
    await page.getByRole('button', { name: 'Зберегти права' }).click();
    await expect(page.getByText('Права збережено.')).toBeVisible();
    expect(
      (await (await context.request.get(permissionsURL)).json()).detail
        .permissions,
    ).toEqual(['teachers.read']);
  } finally {
    if (permissionsURL) {
      const latest = (await (await context.request.get(permissionsURL)).json())
        .detail;
      expect(
        (
          await context.request.put(permissionsURL, {
            headers: { Origin: frontendURL },
            data: {
              permissions: ['subjects.read'],
              expectedVersion: latest.version,
            },
          })
        ).status(),
      ).toBe(200);
    }
    await other.close();
  }
});
