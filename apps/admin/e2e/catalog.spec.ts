import { expect, type Page, test } from '@playwright/test';
import type {
  Permission,
  SubjectResponse,
  TeacherResponse,
} from '@project/contracts';
const subjectId = '11111111-1111-4111-8111-111111111111';
const teacherId = '22222222-2222-4222-8222-222222222222';
const fileId = '33333333-3333-4333-8333-333333333333';
const subject: SubjectResponse = {
  id: subjectId,
  name: 'Історія України',
  slug: 'istoriia',
  sortOrder: 0,
  status: 'DRAFT',
  createdAt: '',
  updatedAt: '1',
  version: 1,
};
const teacher: TeacherResponse = {
  id: teacherId,
  firstName: 'Олена',
  lastName: 'Коваль',
  slug: 'olena-koval',
  shortDescription: 'Викладач історії',
  biography: 'Десять років досвіду',
  photoId: null,
  status: 'DRAFT',
  createdAt: '',
  updatedAt: '1',
  version: 1,
};
async function mock(page: Page, permissions?: Permission[]) {
  const state = {
    subjects: [structuredClone(subject)],
    teachers: [structuredClone(teacher)],
    assigned: [] as { subjectId: string; sortOrder: number }[],
    permissions: [] as Permission[],
    permissionsVersion: 1,
    calls: [] as { path: string; method: string; data: unknown }[],
  };
  await page.route('http://localhost:3000/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const headers = {
      'access-control-allow-origin': 'http://localhost:4173',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const data = request.headers()['content-type']?.includes('application/json')
      ? request.postDataJSON()
      : null;
    state.calls.push({ path, method, data });
    let detail: unknown = {};
    let status = 200;
    const edited = path.startsWith('/admin/subjects/')
      ? state.subjects.find((row) => path.includes(row.id))
      : path.startsWith('/admin/teachers/')
        ? state.teachers.find((row) => path.includes(row.id))
        : undefined;
    if (
      (edited &&
        ['PATCH', 'PUT', 'DELETE'].includes(method) &&
        data?.expectedVersion !== edited.version) ||
      (path.endsWith('/permissions') &&
        method === 'PUT' &&
        data?.expectedVersion !== state.permissionsVersion)
    ) {
      return route.fulfill({
        status: 409,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({
          status_code: 409,
          result: 'error',
          detail: 'Record changed',
          code: 'VERSION_CONFLICT',
        }),
      });
    }
    if (path === '/auth/me')
      detail = {
        id: 'admin',
        firstName: 'Anton',
        lastName: 'Test',
        email: 'admin@example.test',
        role: permissions ? 'MANAGER' : 'ADMIN',
        status: 'ACTIVE',
        permissions: permissions ?? [],
      };
    else if (path === '/admin/delivery')
      detail = {
        status: 'ok',
        metrics: [],
        workers: {
          online: 1,
          activeJobs: 0,
          lastCompletedAt: null,
          lastFailedAt: null,
        },
      };
    else if (path === '/auth/users')
      detail = {
        items: [
          {
            id: teacherId,
            firstName: 'Ірина',
            lastName: 'Менеджер',
            email: 'manager@example.test',
            role: 'MANAGER',
            status: 'ACTIVE',
          },
        ],
        hasMore: false,
      };
    else if (path.endsWith('/permissions')) {
      if (method === 'PUT') {
        state.permissions = data.permissions;
        state.permissionsVersion++;
      }
      detail = {
        permissions: state.permissions,
        version: state.permissionsVersion,
      };
    } else if (path === `/admin/teachers/${teacherId}/subjects`) {
      if (method === 'PUT') {
        state.assigned = data.subjects;
        state.teachers[0].version++;
      }
      detail = { items: state.assigned, version: state.teachers[0].version };
    } else if (path.startsWith('/admin/subjects')) {
      if (method === 'POST') {
        state.subjects.push({
          ...subject,
          ...data,
          id: '44444444-4444-4444-8444-444444444444',
        });
        detail = state.subjects.at(-1);
      } else if (method === 'PATCH') {
        const row = state.subjects.find((item) => path.includes(item.id))!;
        Object.assign(row, data, {
          updatedAt: String(Date.now()),
          version: row.version + 1,
        });
        detail = row;
      } else if (method === 'DELETE') {
        state.subjects = state.subjects.filter(
          (item) => !path.includes(item.id),
        );
        const previous = state.assigned.length;
        state.assigned = state.assigned.filter(
          (item) => !path.includes(item.subjectId),
        );
        if (state.assigned.length !== previous) state.teachers[0].version++;
      } else if (path !== '/admin/subjects' && !edited) {
        status = 404;
        detail = 'Subject not found';
      } else detail = edited ?? { items: state.subjects, hasMore: false };
    } else if (path.startsWith('/admin/teachers')) {
      if (method === 'PATCH') {
        Object.assign(state.teachers[0], data, {
          updatedAt: String(Date.now()),
          version: state.teachers[0].version + 1,
        });
        detail = state.teachers[0];
      } else if (method === 'DELETE')
        state.teachers = state.teachers.filter((row) => !path.includes(row.id));
      else detail = edited ?? { items: state.teachers, hasMore: false };
    } else if (path.endsWith('/content'))
      return route.fulfill({
        headers,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGzQAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    else if (path.startsWith('/admin/media')) {
      if (method === 'DELETE') {
        status = 409;
        detail = 'File is still attached to content';
      } else
        detail = {
          id: fileId,
          kind: path.endsWith('/pdfs') ? 'PDF' : 'IMAGE',
          size: 100,
          mimeType: 'image/webp',
          width: 1,
          height: 1,
          pageCount: null,
          createdAt: '',
          previewUrl: `/admin/media/${fileId}/content`,
        };
    }
    await route.fulfill({
      status,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        status_code: status,
        result: status < 400 ? 'success' : 'error',
        detail,
      }),
    });
  });
  return state;
}
test('subject creation, editing, publication and confirmed deletion', async ({
  page,
}) => {
  const state = await mock(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/subjects');
  await page.getByRole('button', { name: 'Додати напрям' }).click();
  await page.getByLabel('Назва', { exact: true }).fill('Математика');
  await expect(page.getByLabel('Адреса сторінки')).toHaveCount(0);
  await expect(page.getByLabel('Опис', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Математика' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Відкрити' }).click();
  await page.getByLabel('Назва', { exact: true }).fill('Математика НМТ');
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect(page.getByText('Математика НМТ', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Опублікувати', exact: true }).click();
  await expect(row).toContainText('Опубліковано');
  await page.screenshot({
    path: '/tmp/admin-catalog-subjects.png',
    fullPage: true,
  });
  await row.getByRole('button', { name: 'Зняти з публікації' }).click();
  await expect(row).toContainText('Чернетка');
  await row.getByRole('button', { name: 'Видалити', exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(state.calls.some((call) => call.method === 'DELETE')).toBe(true);
});
test('teacher photo upload, save and separate subject assignments', async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto('/teachers');
  await page.getByRole('button', { name: 'Відкрити' }).click();
  await page.getByLabel('Завантажити фото').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('image'),
  });
  await expect(page.getByRole('img', { name: 'Фото викладача' })).toBeVisible();
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect(page.getByText('Зміни збережено.')).toBeVisible();
  expect(state.teachers[0].photoId).toBe(fileId);
  await page.getByRole('checkbox', { name: 'Історія України' }).check();
  await page.getByLabel('Порядок для Історія України').fill('3');
  await page.getByRole('button', { name: 'Зберегти напрями' }).click();
  await expect(page.getByText('Напрями збережено.')).toBeVisible();
  expect(state.assigned).toEqual([{ subjectId, sortOrder: 3 }]);
  await page.screenshot({
    path: '/tmp/admin-catalog-teacher.png',
    fullPage: true,
  });
});
test('manager can read but cannot mutate or enter users and media', async ({
  page,
}) => {
  await mock(page, ['subjects.read']);
  await page.goto('/subjects');
  await expect(page.getByRole('button', { name: 'Додати напрям' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Опублікувати' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Відкрити' }).click();
  await expect(page.getByLabel('Назва', { exact: true })).toBeDisabled();
  await page.goto('/teachers');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/users');
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('link', { name: 'Файли', exact: true }),
  ).toHaveCount(0);
});
test('published record cannot be edited without publish grant', async ({
  page,
}) => {
  const state = await mock(page, ['subjects.read', 'subjects.update']);
  state.subjects[0].status = 'PUBLISHED';
  await page.goto('/subjects');
  await page.getByRole('button', { name: 'Відкрити' }).click();
  await expect(page.getByLabel('Назва', { exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText(
    'потрібне право публікації',
  );
});
test('admin assigns and revokes manager permissions', async ({ page }) => {
  const state = await mock(page);
  await page.goto('/users');
  await page.getByRole('button', { name: 'Права', exact: true }).click();
  await page.getByLabel('Перегляд напрямів', { exact: true }).check();
  await page.getByLabel('Завантаження файлів', { exact: true }).check();
  await page.getByRole('button', { name: 'Зберегти права' }).click();
  await expect(page.getByText('Права збережено.')).toBeVisible();
  expect(state.permissions).toEqual(['subjects.read', 'media.upload']);
  await page.getByRole('button', { name: 'Зняти всі позначки' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Зберегти права' }).click();
  await expect(page.getByText('Права збережено.')).toBeVisible();
  expect(state.permissions).toEqual([]);
});
test('PDF upload and attached-file deletion error', async ({ page }) => {
  await mock(page);
  await page.goto('/media');
  await page.getByLabel('Завантажити PDF', { exact: true }).setInputFiles({
    name: 'guide.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7'),
  });
  await expect(
    page.getByRole('heading', { name: 'PDF-документ' }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Видалити файл', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('File is still attached');
  await expect(
    page.getByRole('heading', { name: 'PDF-документ' }),
  ).toBeVisible();
});

test('mobile catalog form retains input after server conflict', async ({
  page,
}) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/admin/subjects', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 409,
      headers: {
        'access-control-allow-origin': 'http://localhost:4173',
        'access-control-allow-credentials': 'true',
      },
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Concurrent update; please retry' }),
    });
  });
  await page.goto('/subjects');
  await page.getByRole('button', { name: 'Додати напрям' }).click();
  await page.getByLabel('Назва', { exact: true }).fill('Історія');
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Concurrent update; please retry',
  );
  await expect(page.getByLabel('Назва', { exact: true })).toHaveValue(
    'Історія',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '/tmp/admin-catalog-mobile.png',
    fullPage: true,
  });
});
test('create-only manager can create without requesting the private list', async ({
  page,
}) => {
  const state = await mock(page, ['subjects.create']);
  await page.goto('/subjects');
  await expect(
    page.getByRole('button', { name: 'Додати напрям' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Усі записи' })).toHaveCount(
    0,
  );
  expect(
    state.calls.filter(
      (call) => call.path === '/admin/subjects' && call.method === 'GET',
    ),
  ).toHaveLength(0);
});

test('stale subject form keeps input, survives failed review, and merges independent edits', async ({
  page,
}) => {
  const state = await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/subjects');
  await page.getByRole('button', { name: 'Відкрити' }).click();
  await page.getByLabel('Назва', { exact: true }).fill('Моя назва');
  state.subjects[0].sortOrder = 7;
  state.subjects[0].version++;
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect(
    page.getByText('Запис змінив інший користувач.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel('Назва', { exact: true })).toHaveValue(
    'Моя назва',
  );
  await expect(
    page.getByRole('button', { name: 'Зберегти', exact: true }),
  ).toBeDisabled();
  let failReview = true;
  await page.route(`**/admin/subjects/${subjectId}`, async (route) => {
    if (route.request().method() !== 'GET' || !failReview)
      return route.fallback();
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Тимчасово недоступно' }),
    });
  });
  await page
    .getByRole('button', { name: 'Зіставити з актуальними даними' })
    .click();
  await expect(page.getByText('Тимчасово недоступно')).toBeVisible();
  await expect(page.getByLabel('Назва', { exact: true })).toHaveValue(
    'Моя назва',
  );
  await expect(
    page.getByRole('button', { name: 'Зберегти', exact: true }),
  ).toBeDisabled();
  failReview = false;
  await page
    .getByRole('button', { name: 'Зіставити з актуальними даними' })
    .click();
  await expect(page.getByLabel('Порядок відображення')).toHaveValue('7');
  await expect(page.getByLabel('Назва', { exact: true })).toHaveValue(
    'Моя назва',
  );
  expect(state.calls.filter((call) => call.method === 'PATCH')).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect(page.getByText('Зміни збережено.')).toBeVisible();
  expect(state.subjects[0]).toMatchObject({
    name: 'Моя назва',
    sortOrder: 7,
    version: 3,
  });
});

test('teacher conflict requires a field choice and checks the version again on retry', async ({
  page,
}) => {
  const state = await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/teachers');
  await page.getByRole('button', { name: 'Відкрити' }).click();
  await page.getByLabel('Короткий опис', { exact: true }).fill('Мій опис');
  await page.getByLabel('Біографія', { exact: true }).fill('Моя біографія');
  await page.getByLabel('Завантажити фото').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('image'),
  });
  await expect(page.getByRole('img', { name: 'Фото викладача' })).toBeVisible();
  state.teachers[0].shortDescription = 'Опис іншого редактора';
  state.teachers[0].firstName = 'Нове ім’я';
  state.teachers[0].version++;
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect(page.getByLabel('Короткий опис', { exact: true })).toHaveValue(
    'Мій опис',
  );
  await page
    .getByRole('button', { name: 'Зіставити з актуальними даними' })
    .click();
  await expect(
    page.getByText('Опис іншого редактора', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Зберегти', exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '/tmp/edu-version-conflict-choices.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Залишити моє: Короткий опис' })
    .click();
  await expect(page.getByLabel('Ім’я', { exact: true })).toHaveValue(
    'Нове ім’я',
  );
  // Another editor saves after the conflict was reviewed: no blind retry is allowed.
  state.teachers[0].lastName = 'Нове прізвище';
  state.teachers[0].version++;
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await page
    .getByRole('button', { name: 'Зіставити з актуальними даними' })
    .click();
  await expect(page.getByLabel('Прізвище', { exact: true })).toHaveValue(
    'Нове прізвище',
  );
  await expect(page.getByLabel('Біографія', { exact: true })).toHaveValue(
    'Моя біографія',
  );
  await page.screenshot({
    path: '/tmp/edu-version-conflict-reviewed.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect(page.getByText('Зміни збережено.')).toBeVisible();
  expect(state.teachers[0]).toMatchObject({
    firstName: 'Нове ім’я',
    lastName: 'Нове прізвище',
    shortDescription: 'Мій опис',
    biography: 'Моя біографія',
    photoId: fileId,
    version: 4,
  });
});

test('assignment conflict preserves draft order until the editor chooses the current list', async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto('/teachers');
  await page.getByRole('button', { name: 'Відкрити' }).click();
  await page.getByRole('checkbox', { name: 'Історія України' }).check();
  await page.getByLabel('Порядок для Історія України').fill('3');
  state.assigned = [{ subjectId, sortOrder: 9 }];
  state.teachers[0].version++;
  await page.getByRole('button', { name: 'Зберегти напрями' }).click();
  await expect(page.getByLabel('Порядок для Історія України')).toHaveValue('3');
  await page
    .getByRole('button', { name: 'Зіставити з актуальними даними' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Зберегти напрями' }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Прийняти актуальне: Напрями викладача' })
    .click();
  await expect(page.getByLabel('Порядок для Історія України')).toHaveValue('9');
  await page.getByRole('button', { name: 'Зберегти напрями' }).click();
  await expect(page.getByText('Напрями збережено.')).toBeVisible();
  expect(state.assigned).toEqual([{ subjectId, sortOrder: 9 }]);
  expect(state.teachers[0].version).toBe(3);
});

for (const resource of ['subjects', 'teachers'] as const) {
  test(`stale ${resource} deletion requires review and a second confirmation`, async ({
    page,
  }) => {
    const state = await mock(page);
    await page.goto(`/${resource}`);
    await expect(
      page.getByRole('button', { name: 'Видалити', exact: true }),
    ).toBeVisible();
    const row = state[resource][0];
    row.version++;
    row.updatedAt = '2';
    if (resource === 'subjects') state.subjects[0].name = 'Актуальний напрям';
    else state.teachers[0].biography = 'Актуальна біографія';
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Видалити', exact: true }).click();
    await expect(
      page.getByText('Запис змінив інший користувач. Видалення скасовано.'),
    ).toBeVisible();
    expect(state[resource]).toHaveLength(1);
    await expect(
      page.getByRole('button', { name: 'Видалити', exact: true }),
    ).toBeDisabled();
    // Finish this review before opening another draft that could be replaced.
    await expect(page.getByRole('button', { name: 'Відкрити' })).toBeDisabled();
    await expect(
      page.getByRole('button', {
        name: resource === 'subjects' ? 'Додати напрям' : 'Додати викладача',
      }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Переглянути актуальний запис' })
      .click();
    await expect(
      page.getByLabel(resource === 'subjects' ? 'Назва' : 'Біографія', {
        exact: true,
      }),
    ).toHaveValue(
      resource === 'subjects' ? 'Актуальний напрям' : 'Актуальна біографія',
    );
    expect(state.calls.filter((call) => call.method === 'DELETE')).toHaveLength(
      1,
    );
    await page.getByRole('button', { name: 'Закрити', exact: true }).click();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Видалити', exact: true }).click();
    expect(state.calls.filter((call) => call.method === 'DELETE')).toHaveLength(
      1,
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Видалити', exact: true }).click();
    await expect(
      page.getByText('Запис видалено.', { exact: true }),
    ).toBeVisible();
    expect(state[resource]).toHaveLength(0);
    expect(
      state.calls
        .filter((call) => call.method === 'DELETE')
        .map((call) => call.data),
    ).toEqual([{ expectedVersion: 1 }, { expectedVersion: 2 }]);
  });
}

test('permissions conflict keeps selected grants, survives failed review and requires choosing the whole set', async ({
  page,
}) => {
  const state = await mock(page);
  state.permissions = ['subjects.read'];
  await page.goto('/users');
  await page.getByRole('button', { name: 'Права', exact: true }).click();
  await page.getByLabel('Завантаження файлів', { exact: true }).check();
  state.permissions = []; // Another administrator revoked access.
  state.permissionsVersion++;
  await page.getByRole('button', { name: 'Зберегти права' }).click();
  await expect(
    page.getByText('Запис змінив інший користувач.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Перегляд напрямів', { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel('Завантаження файлів', { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Зберегти права' }),
  ).toBeDisabled();
  let fail = true;
  await page.route('**/permissions', async (route) => {
    if (route.request().method() !== 'GET' || !fail) return route.fallback();
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Тимчасово недоступно' }),
    });
  });
  await page
    .getByRole('button', { name: 'Зіставити з актуальними даними' })
    .click();
  await expect(page.getByText('Тимчасово недоступно')).toBeVisible();
  await expect(
    page.getByLabel('Завантаження файлів', { exact: true }),
  ).toBeChecked();
  fail = false;
  await page
    .getByRole('button', { name: 'Зіставити з актуальними даними' })
    .click();
  await expect(page.getByText('Усі права відкликано')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Зберегти права' }),
  ).toBeDisabled();
  expect(state.permissions).toEqual([]);
  await page
    .getByRole('button', { name: 'Прийняти актуальне: Права доступу' })
    .click();
  await expect(
    page.getByLabel('Перегляд напрямів', { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel('Завантаження файлів', { exact: true }),
  ).not.toBeChecked();
  expect(state.calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Зберегти права' }).click();
  await expect(page.getByText('Права збережено.')).toBeVisible();
  expect(state.permissionsVersion).toBe(3);
});

test('a second permissions conflict preserves the local choice and never retries automatically', async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto('/users');
  await page.getByRole('button', { name: 'Права', exact: true }).click();
  await page.getByLabel('Перегляд напрямів', { exact: true }).check();
  state.permissions = ['media.read'];
  state.permissionsVersion++;
  await page.getByRole('button', { name: 'Зберегти права' }).click();
  await page
    .getByRole('button', { name: 'Зіставити з актуальними даними' })
    .click();
  await page
    .getByRole('button', { name: 'Залишити моє: Права доступу' })
    .click();
  state.permissions = ['teachers.read'];
  state.permissionsVersion++;
  await page.getByRole('button', { name: 'Зберегти права' }).click();
  await expect(
    page.getByRole('button', { name: 'Зберегти права' }),
  ).toBeDisabled();
  await expect(
    page.getByLabel('Перегляд напрямів', { exact: true }),
  ).toBeChecked();
  expect(state.permissions).toEqual(['teachers.read']);
  expect(
    state.calls
      .filter((call) => call.method === 'PUT')
      .map((call) => call.data),
  ).toEqual([
    { permissions: ['subjects.read'], expectedVersion: 1 },
    { permissions: ['subjects.read'], expectedVersion: 2 },
  ]);
});

test('a deleted subject remains visible in the assignment draft and can be removed without losing other edits', async ({
  page,
}) => {
  const state = await mock(page);
  const remaining = {
    ...subject,
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Математика',
  };
  state.subjects.push(remaining);
  state.assigned = [
    { subjectId, sortOrder: 0 },
    { subjectId: remaining.id, sortOrder: 1 },
  ];
  state.teachers[0].version = 2;
  await page.goto('/teachers');
  await page.getByRole('button', { name: 'Відкрити' }).click();
  await page
    .getByLabel('Біографія', { exact: true })
    .fill('Незбережена біографія');
  await page.getByLabel('Порядок для Математика').fill('7');
  state.subjects = [remaining];
  state.assigned = [{ subjectId: remaining.id, sortOrder: 1 }];
  state.teachers[0].version++;
  await page.getByRole('button', { name: 'Зберегти напрями' }).click();
  await expect(
    page.getByRole('button', { name: 'Зберегти напрями' }),
  ).toBeDisabled();
  await expect(page.getByLabel('Порядок для Математика')).toHaveValue('7');
  await page
    .getByRole('button', { name: 'Зіставити з актуальними даними' })
    .click();
  await page
    .getByRole('button', { name: 'Залишити моє: Напрями викладача' })
    .click();
  await expect(
    page.getByText('Цей напрям видалено.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel('Біографія', { exact: true })).toHaveValue(
    'Незбережена біографія',
  );
  await expect(page.getByLabel('Порядок для Математика')).toHaveValue('7');
  expect(state.calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
  await page.getByRole('button', { name: 'Прибрати видалений напрям' }).click();
  await page.getByRole('button', { name: 'Зберегти напрями' }).click();
  await expect(
    page.getByText('Напрями збережено.', { exact: true }),
  ).toBeVisible();
  expect(state.assigned).toEqual([{ subjectId: remaining.id, sortOrder: 7 }]);
  expect(
    state.calls.filter((call) => call.method === 'PUT').at(-1)?.data,
  ).toEqual({
    expectedVersion: 3,
    subjects: [{ subjectId: remaining.id, sortOrder: 7 }],
  });
});

test('selected subjects outside the current page are not treated as deleted, including when lookup fails', async ({
  page,
}) => {
  const state = await mock(page);
  const other = {
    ...subject,
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Напрям з іншої сторінки',
  };
  state.subjects.push(other);
  state.assigned = [{ subjectId: other.id, sortOrder: 8 }];
  await page.route('**/admin/subjects?*', async (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ detail: { items: [subject], hasMore: true } }),
    }),
  );
  await page.route(`**/admin/subjects/${other.id}`, async (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Пошук тимчасово недоступний' }),
    }),
  );
  await page.goto('/teachers');
  await page.getByRole('button', { name: 'Відкрити' }).click();
  await expect(page.getByText('Пошук тимчасово недоступний')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Прибрати видалений напрям' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Обрано 1 із 50.', { exact: false }),
  ).toBeVisible();
  expect(state.assigned).toEqual([{ subjectId: other.id, sortOrder: 8 }]);
  await page.unroute(`**/admin/subjects/${other.id}`);
  await page.reload();
  await page.getByRole('button', { name: 'Відкрити' }).click();
  await expect(page.getByText(other.name, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Прибрати видалений напрям' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Прибрати вибраний напрям' }).click();
  await expect(
    page.getByText('Обрано 0 із 50.', { exact: false }),
  ).toBeVisible();
});
