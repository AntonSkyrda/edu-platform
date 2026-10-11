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
};
async function mock(page: Page, permissions?: Permission[]) {
  const state = {
    subjects: [structuredClone(subject)],
    teachers: [structuredClone(teacher)],
    assigned: [] as { subjectId: string; sortOrder: number }[],
    permissions: [] as Permission[],
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
      if (method === 'PUT') state.permissions = data.permissions;
      detail = { permissions: state.permissions };
    } else if (path === `/admin/teachers/${teacherId}/subjects`) {
      if (method === 'PUT') state.assigned = data.subjects;
      detail = { items: state.assigned };
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
        Object.assign(row, data, { updatedAt: String(Date.now()) });
        detail = row;
      } else if (method === 'DELETE')
        state.subjects = state.subjects.filter(
          (item) => !path.includes(item.id),
        );
      else detail = { items: state.subjects, hasMore: false };
    } else if (path.startsWith('/admin/teachers')) {
      if (method === 'PATCH') {
        Object.assign(state.teachers[0], data, {
          updatedAt: String(Date.now()),
        });
        detail = state.teachers[0];
      } else detail = { items: state.teachers, hasMore: false };
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
