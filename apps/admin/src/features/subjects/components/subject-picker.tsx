import type { TeacherSubjectAssignment } from '@project/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorNotice } from '@/shared/ui/feedback';
import { Pagination } from '@/shared/ui/pagination';

import { subjectsApi } from '../api/subjects-api';
export function SubjectPicker({
  value,
  onChange,
  disabled,
}: {
  value: TeacherSubjectAssignment[];
  onChange: (value: TeacherSubjectAssignment[]) => void;
  disabled: boolean;
}) {
  const [page, setPage] = useState(0);
  const subjects = useQuery({
    queryKey: ['subjects', page],
    queryFn: ({ signal }) => subjectsApi.list(page, signal),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Обрано {value.length} із 50. Порядок визначає позицію викладача в
        напрямі.
      </p>
      <ErrorNotice error={subjects.error} />
      {subjects.isPending && <p role="status">Завантаження напрямів…</p>}
      {subjects.data?.items.map((subject) => {
        const selected = value.find((item) => item.subjectId === subject.id);
        return (
          <div
            key={subject.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={!!selected}
                disabled={disabled || (!selected && value.length >= 50)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...value, { subjectId: subject.id, sortOrder: 0 }]
                      : value.filter((item) => item.subjectId !== subject.id),
                  )
                }
              />
              {subject.name}
              {subject.status === 'DRAFT' && (
                <span className="text-xs text-muted-foreground">Чернетка</span>
              )}
            </label>
            {selected && (
              <label className="flex items-center gap-2 text-sm">
                Порядок для {subject.name}
                <input
                  className="w-24 rounded border p-2"
                  type="number"
                  min={0}
                  max={2147483647}
                  disabled={disabled}
                  value={selected.sortOrder}
                  onChange={(event) =>
                    onChange(
                      value.map((item) =>
                        item.subjectId === subject.id
                          ? { ...item, sortOrder: event.target.valueAsNumber }
                          : item,
                      ),
                    )
                  }
                />
              </label>
            )}
          </div>
        );
      })}
      {subjects.data?.items.length === 0 && <p>Спочатку створіть напрям.</p>}
      <Pagination
        page={page}
        hasMore={subjects.data?.hasMore ?? false}
        busy={subjects.isFetching}
        onChange={setPage}
      />
    </div>
  );
}
