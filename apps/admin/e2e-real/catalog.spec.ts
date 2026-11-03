import { apiURL, createSubject, expect, frontendURL, test } from './fixtures';

test('subject create, edit, publish, unpublish and delete persist in the API', async ({
  page,
  request,
}) => {
  const row = await createSubject(page, 'E2E lifecycle');
  await row.getByRole('button', { name: 'Відкрити' }).click();
  await page.getByLabel('Назва', { exact: true }).fill('E2E lifecycle edited');
  await page.getByLabel('Порядок відображення').fill('4');
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await page.reload();
  await expect(row).toContainText('E2E lifecycle edited');
  await expect(row).toContainText('Чернетка');
  page.on('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Опублікувати', exact: true }).click();
  await expect(row).toContainText('Опубліковано');
  const published = await request.get(`${apiURL}/catalog/subjects`);
  expect(published.status()).toBe(200);
  expect((await published.json()).detail.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'E2E lifecycle edited', sortOrder: 4 }),
    ]),
  );
  await row.getByRole('button', { name: 'Зняти з публікації' }).click();
  await expect(row).toContainText('Чернетка');
  expect(
    JSON.stringify(
      (await (await request.get(`${apiURL}/catalog/subjects`)).json()).detail,
    ),
  ).not.toContain('E2E lifecycle edited');
  await row.getByRole('button', { name: 'Видалити', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Оновити', exact: true }),
  ).toBeEnabled();
  await expect(row).toHaveCount(0);
});

test('two editors preserve a draft on 409 and merge independent changes', async ({
  page,
  context,
}) => {
  const row = await createSubject(page, 'E2E concurrent');
  await row.getByRole('button', { name: 'Відкрити' }).click();
  const other = await context.newPage();
  try {
    await other.goto('/subjects');
    await other
      .getByRole('row')
      .filter({ hasText: 'E2E concurrent' })
      .getByRole('button', { name: 'Відкрити' })
      .click();
    await page
      .getByLabel('Назва', { exact: true })
      .fill('E2E concurrent local');
    await other.getByLabel('Порядок відображення').fill('7');
    await other.getByRole('button', { name: 'Зберегти', exact: true }).click();
    await expect(
      other.getByText('Зміни збережено.', { exact: true }),
    ).toBeVisible();
    const conflict = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes('/admin/subjects/'),
    );
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
    expect((await conflict).status()).toBe(409);
    await expect(
      page.getByText('Запис змінив інший користувач.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel('Назва', { exact: true })).toHaveValue(
      'E2E concurrent local',
    );
    await expect(
      page.getByRole('button', { name: 'Зберегти', exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Зіставити з актуальними даними' })
      .click();
    await expect(page.getByLabel('Порядок відображення')).toHaveValue('7');
    await expect(page.getByLabel('Назва', { exact: true })).toHaveValue(
      'E2E concurrent local',
    );
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
    await expect(
      page.getByText('Зміни збережено.', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await row.getByRole('button', { name: 'Відкрити' }).click();
    await expect(page.getByLabel('Порядок відображення')).toHaveValue('7');
    await expect(page.getByLabel('Назва', { exact: true })).toHaveValue(
      'E2E concurrent local',
    );
  } finally {
    await other.close();
  }
});

test('teacher photo upload and subject assignments survive reload', async ({
  page,
}) => {
  await createSubject(page, 'E2E photo subject');
  await page.goto('/teachers');
  await page.getByRole('button', { name: 'Додати викладача' }).click();
  await page.getByLabel('Ім’я', { exact: true }).fill('E2E');
  await page.getByLabel('Прізвище', { exact: true }).fill('Teacher');
  await page
    .getByLabel('Короткий опис', { exact: true })
    .fill('Teacher with an uploaded photo');
  await page
    .getByLabel('Біографія', { exact: true })
    .fill('Real API browser test biography.');
  await page.getByLabel('Завантажити фото', { exact: false }).setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAn0lEQVRoge2SQQkAQRDD6qmezlPcroh7hIFCBKSh6cdpoht0A9ArdhfiLtENugHoFbsLcZfoBt0A9IrdhbhLdINuAHrF7kLcJbpBNwC9Ynch7hLdoBuAXrG7EHeJbtANQK/YXYi7RDfoBqBX7C7EXaIbdAPQK3YX4i7RDboB6BW7C3GX6AbdAPSK3YW4S3SDbgB6xe5C3CW6QTcAveIfHtpIIR6K7EbZAAAAAElFTkSuQmCC',
      'base64',
    ),
  });
  await expect(page.getByRole('img', { name: 'Фото викладача' })).toBeVisible();
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect(
    page.getByText('Зміни збережено.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('checkbox', { name: 'E2E photo subject', exact: false })
    .check();
  await page.getByLabel('Порядок для E2E photo subject').fill('3');
  await page
    .getByRole('button', { name: 'Зберегти напрями', exact: true })
    .click();
  await expect(
    page.getByText('Напрями збережено.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('row')
    .filter({ hasText: 'E2E Teacher' })
    .getByRole('button', { name: 'Відкрити' })
    .click();
  await expect(
    page.getByRole('checkbox', { name: 'E2E photo subject', exact: false }),
  ).toBeChecked();
  await expect(page.getByLabel('Порядок для E2E photo subject')).toHaveValue(
    '3',
  );
  const image = page.getByRole('img', { name: 'Фото викладача' });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(page.getByLabel('Короткий опис', { exact: true })).toHaveValue(
    'Teacher with an uploaded photo',
  );
});

for (const resource of ['subjects', 'teachers'] as const) {
  test(`real ${resource} deletion refuses newer changes and requires review`, async ({
    page,
    context,
  }) => {
    const created = await context.request.post(`${apiURL}/admin/${resource}`, {
      headers: { Origin: frontendURL },
      data:
        resource === 'subjects'
          ? { name: 'E2E guarded deletion' }
          : { firstName: 'E2E', lastName: 'Guarded deletion' },
    });
    expect(created.status()).toBe(201);
    const record = (await created.json()).detail;
    const url = `${apiURL}/admin/${resource}/${record.id}`;
    await page.goto(`/${resource}`);
    const row = page.getByRole('row').filter({
      hasText:
        resource === 'subjects'
          ? record.name
          : `${record.firstName} ${record.lastName}`,
    });
    await expect(row).toBeVisible();
    const changed = await context.request.patch(url, {
      headers: { Origin: frontendURL },
      data: {
        expectedVersion: record.version,
        ...(resource === 'subjects'
          ? { name: 'E2E updated before deletion' }
          : { biography: 'Newer biography must survive' }),
      },
    });
    expect(changed.status()).toBe(200);
    const conflict = page.waitForResponse(
      (response) =>
        response.url() === url && response.request().method() === 'DELETE',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Видалити', exact: true }).click();
    expect((await conflict).status()).toBe(409);
    await expect(
      page.getByText('Запис змінив інший користувач. Видалення скасовано.'),
    ).toBeVisible();
    expect((await context.request.get(url)).status()).toBe(200);
    await page
      .getByRole('button', { name: 'Переглянути актуальний запис' })
      .click();
    await expect(
      page.getByLabel(resource === 'subjects' ? 'Назва' : 'Біографія', {
        exact: true,
      }),
    ).toHaveValue(
      resource === 'subjects'
        ? 'E2E updated before deletion'
        : 'Newer biography must survive',
    );
    await page.getByRole('button', { name: 'Закрити', exact: true }).click();
    const currentRow = page.getByRole('row').filter({
      hasText:
        resource === 'subjects'
          ? 'E2E updated before deletion'
          : `${record.firstName} ${record.lastName}`,
    });
    const deleted = page.waitForResponse(
      (response) =>
        response.url() === url && response.request().method() === 'DELETE',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await currentRow
      .getByRole('button', { name: 'Видалити', exact: true })
      .click();
    const response = await deleted;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({
      expectedVersion: record.version + 1,
    });
    expect((await context.request.get(url)).status()).toBe(404);
  });
}

async function cascadeFixture(
  request: import('@playwright/test').APIRequestContext,
  suffix: string,
) {
  const options = { headers: { Origin: frontendURL } };
  const subjects = [];
  for (const name of [`E2E removed ${suffix}`, `E2E kept ${suffix}`]) {
    const response = await request.post(`${apiURL}/admin/subjects`, {
      ...options,
      data: { name },
    });
    expect(response.status()).toBe(201);
    subjects.push((await response.json()).detail);
  }
  const response = await request.post(`${apiURL}/admin/teachers`, {
    ...options,
    data: {
      firstName: 'E2E',
      lastName: `Cascade ${suffix}`,
      biography: 'Original biography',
    },
  });
  expect(response.status()).toBe(201);
  const teacher = (await response.json()).detail;
  const url = `${apiURL}/admin/teachers/${teacher.id}`;
  const assigned = await request.put(`${url}/subjects`, {
    ...options,
    data: {
      expectedVersion: 1,
      subjects: subjects.map((subject, sortOrder) => ({
        subjectId: subject.id,
        sortOrder,
      })),
    },
  });
  expect(assigned.status()).toBe(200);
  return { subjects, teacher, url, options };
}

test('subject deletion conflicts with open assignment and teacher drafts; review retains surviving edits', async ({
  page,
  context,
}) => {
  const { subjects, teacher, url, options } = await cascadeFixture(
    context.request,
    'drafts',
  );
  await page.goto('/teachers');
  await page
    .getByRole('row')
    .filter({ hasText: `${teacher.firstName} ${teacher.lastName}` })
    .getByRole('button', { name: 'Відкрити' })
    .click();
  await page
    .getByLabel('Біографія', { exact: true })
    .fill('My unsaved biography');
  await page.getByLabel(`Порядок для ${subjects[1].name}`).fill('7');
  const deletion = await context.request.delete(
    `${apiURL}/admin/subjects/${subjects[0].id}`,
    {
      ...options,
      data: { expectedVersion: 1 },
    },
  );
  expect(deletion.status()).toBe(200);
  const conflict = page.waitForResponse(
    (response) =>
      response.url() === `${url}/subjects` &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Зберегти напрями' }).click();
  expect((await conflict).status()).toBe(409);
  await expect(page.getByLabel('Біографія', { exact: true })).toHaveValue(
    'My unsaved biography',
  );
  await page
    .getByRole('button', { name: 'Зіставити з актуальними даними' })
    .click();
  await page
    .getByRole('button', { name: 'Залишити моє: Напрями викладача' })
    .click();
  await expect(
    page.getByText('Цей напрям видалено.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Прибрати видалений напрям' }).click();
  await expect(page.getByLabel(`Порядок для ${subjects[1].name}`)).toHaveValue(
    '7',
  );
  await page.getByRole('button', { name: 'Зберегти напрями' }).click();
  await expect(
    page.getByText('Напрями збережено.', { exact: true }),
  ).toBeVisible();
  expect(
    (await (await context.request.get(`${url}/subjects`)).json()).detail,
  ).toEqual({
    version: 4,
    items: [{ subjectId: subjects[1].id, sortOrder: 7 }],
  });
  const contentConflict = page.waitForResponse(
    (response) =>
      response.url() === url && response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  expect((await contentConflict).status()).toBe(409);
  await expect(page.getByLabel('Біографія', { exact: true })).toHaveValue(
    'My unsaved biography',
  );
  await page
    .getByRole('button', { name: 'Зіставити з актуальними даними' })
    .click();
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect(
    page.getByText('Зміни збережено.', { exact: true }),
  ).toBeVisible();
  const saved = (await (await context.request.get(url)).json()).detail;
  expect(saved.biography).toBe('My unsaved biography');
  expect(saved.version).toBe(5);
});

test('subject cascade prevents a stale teacher deletion and requires another confirmation', async ({
  page,
  context,
}) => {
  const { subjects, teacher, url, options } = await cascadeFixture(
    context.request,
    'delete',
  );
  await page.goto('/teachers');
  const row = page
    .getByRole('row')
    .filter({ hasText: `${teacher.firstName} ${teacher.lastName}` });
  await expect(row).toBeVisible();
  expect(
    (
      await context.request.delete(
        `${apiURL}/admin/subjects/${subjects[0].id}`,
        {
          ...options,
          data: { expectedVersion: 1 },
        },
      )
    ).status(),
  ).toBe(200);
  const conflict = page.waitForResponse(
    (response) =>
      response.url() === url && response.request().method() === 'DELETE',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Видалити', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(
    page.getByText('Запис змінив інший користувач. Видалення скасовано.'),
  ).toBeVisible();
  expect((await context.request.get(url)).status()).toBe(200);
  await page
    .getByRole('button', { name: 'Переглянути актуальний запис' })
    .click();
  await expect(
    page.getByRole('checkbox', { name: subjects[1].name, exact: false }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: subjects[0].name, exact: false }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрити', exact: true }).click();
  const deleted = page.waitForResponse(
    (response) =>
      response.url() === url && response.request().method() === 'DELETE',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Видалити', exact: true }).click();
  const response = await deleted;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ expectedVersion: 3 });
});
