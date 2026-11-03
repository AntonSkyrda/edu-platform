import { ApiError } from '@/shared/api/api-error';
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiError && error.code === 'VERSION_CONFLICT'
      ? 'Запис змінив інший користувач. Перевірте актуальні дані перед повторною дією.'
      : error instanceof ApiError && error.status === 429
        ? 'Забагато спроб. Зачекайте хвилину та повторіть.'
        : error instanceof Error
          ? error.message
          : 'Не вдалося виконати запит. Спробуйте ще раз.';
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
}
export function SuccessNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
    >
      {children}
    </div>
  );
}
