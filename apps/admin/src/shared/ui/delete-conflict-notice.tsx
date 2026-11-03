import { useMutation } from '@tanstack/react-query';

import { ApiError } from '@/shared/api/api-error';

import { Button } from './button';
import { ErrorNotice } from './feedback';

export function DeleteConflictNotice<T>({
  readLatest,
  onReview,
  onCancel,
}: {
  readLatest: () => Promise<T>;
  onReview: (record: T) => void;
  onCancel: () => void;
}) {
  const latest = useMutation({ mutationFn: readLatest, onSuccess: onReview });
  const removed =
    latest.error instanceof ApiError && latest.error.status === 404;
  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4"
    >
      <p>
        {removed
          ? 'Запис уже видалено іншим користувачем.'
          : 'Запис змінив інший користувач. Видалення скасовано.'}
      </p>
      {!removed && (
        <>
          <p className="text-sm">
            Перегляньте актуальний запис. Після перегляду можна повернутися до
            списку й підтвердити видалення ще раз.
          </p>
          <Button
            variant="outline"
            disabled={latest.isPending}
            onClick={() => latest.mutate()}
          >
            {latest.isPending
              ? 'Завантаження…'
              : 'Переглянути актуальний запис'}
          </Button>
          <ErrorNotice error={latest.error} />
        </>
      )}
      <Button variant="ghost" disabled={latest.isPending} onClick={onCancel}>
        {removed ? 'Закрити повідомлення' : 'Залишити запис'}
      </Button>
    </div>
  );
}
