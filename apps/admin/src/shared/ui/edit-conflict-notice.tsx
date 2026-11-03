import type { ReactNode } from 'react';

import { Button } from './button';
import { ErrorNotice } from './feedback';

export function EditConflictNotice({
  needsReview,
  reviewed,
  pending,
  error,
  fields,
  onReview,
}: {
  needsReview: boolean;
  reviewed: boolean;
  pending: boolean;
  error: unknown;
  fields: {
    key: string;
    label: string;
    local: ReactNode;
    remote: ReactNode;
    choose: (source: 'local' | 'remote') => void;
  }[];
  onReview: () => void;
}) {
  if (!needsReview && !reviewed) return null;
  return (
    <div
      className="my-4 space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-4"
      role="alert"
    >
      <p className="font-medium">
        Запис змінив інший користувач. Ваші введені дані збережено у формі.
      </p>
      {needsReview ? (
        <>
          <p className="text-sm">Зіставте зміни перед повторним збереженням.</p>
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-10 max-w-full whitespace-normal text-left"
            disabled={pending}
            onClick={onReview}
          >
            {pending ? 'Завантаження…' : 'Зіставити з актуальними даними'}
          </Button>
        </>
      ) : fields.length ? (
        <>
          <p className="text-sm">
            Незалежні зміни об’єднано. Оберіть значення полів, які змінили
            обидва редактори.
          </p>
          {fields.map((field) => (
            <section
              key={field.key}
              className="space-y-3 border-t border-amber-200 pt-3"
            >
              <h3 className="font-medium">{field.label}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-medium">Ваше значення</p>
                  <div className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">
                    {field.local}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-10 max-w-full whitespace-normal text-left"
                    onClick={() => field.choose('local')}
                  >
                    Залишити моє: {field.label}
                  </Button>
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-medium">Актуальне значення</p>
                  <div className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">
                    {field.remote}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-10 max-w-full whitespace-normal text-left"
                    onClick={() => field.choose('remote')}
                  >
                    Прийняти актуальне: {field.label}
                  </Button>
                </div>
              </div>
            </section>
          ))}
        </>
      ) : (
        <p className="text-sm">
          Зміни зіставлено. Перевірте форму та натисніть «Зберегти».
        </p>
      )}
      <ErrorNotice error={error} />
    </div>
  );
}
