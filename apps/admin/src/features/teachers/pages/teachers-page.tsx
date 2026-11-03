import type { TeacherResponse } from '@project/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { usePermissions } from '@/features/auth';
import { ApiError } from '@/shared/api/api-error';
import { isVersionConflict } from '@/shared/lib/use-edit-conflict';
import { Button } from '@/shared/ui/button';
import { DeleteConflictNotice } from '@/shared/ui/delete-conflict-notice';
import { ErrorNotice, SuccessNotice } from '@/shared/ui/feedback';
import { Pagination } from '@/shared/ui/pagination';

import { teachersApi } from '../api/teachers-api';
import { TeacherAssignments } from '../components/teacher-assignments';
import { TeacherForm } from '../components/teachers-form';
export function TeachersPage() {
  const can = usePermissions();
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<TeacherResponse | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [deleteConflict, setDeleteConflict] = useState<TeacherResponse | null>(
    null,
  );
  const records = useQuery({
    queryKey: ['teachers', page],
    queryFn: ({ signal }) => teachersApi.list(page, signal),
    enabled: can('teachers.read'),
  });
  const action = useMutation({
    mutationFn: async ({
      item,
      operation,
    }: {
      item: TeacherResponse;
      operation: 'publish' | 'delete';
    }) => {
      if (operation === 'delete') {
        await teachersApi.remove(item.id, item.version);
        return null;
      }
      return teachersApi.publish(
        item.id,
        item.status === 'DRAFT' ? 'PUBLISHED' : 'DRAFT',
        item.version,
      );
    },
    onError: (error, variables) => {
      if (isVersionConflict(error) && variables.operation === 'delete')
        setDeleteConflict(variables.item);
      if (
        isVersionConflict(error) ||
        (error instanceof ApiError && error.status === 404)
      )
        void client.invalidateQueries({ queryKey: ['teachers'] });
    },
    onSuccess: (updated, variables) => {
      setEditing((current) =>
        current && current !== 'new' && current.id === variables.item.id
          ? updated
          : current,
      );
      setNotice(
        variables.operation === 'delete'
          ? 'Запис видалено.'
          : 'Статус оновлено.',
      );
      void client.invalidateQueries({ queryKey: ['teachers'] });
      if (
        variables.operation === 'delete' &&
        records.data?.items.length === 1 &&
        page > 0
      )
        setPage(page - 1);
    },
  });
  function perform(item: TeacherResponse, operation: 'publish' | 'delete') {
    const message =
      operation === 'delete'
        ? 'Видалити запис назавжди? Цю дію неможливо скасувати.'
        : item.status === 'PUBLISHED'
          ? 'Зняти запис із публікації?'
          : 'Опублікувати запис на сайті?';
    if (window.confirm(message)) {
      setNotice('');
      action.mutate({ item, operation });
    }
  }
  if (!can('teachers.read') && !can('teachers.create'))
    return <p role="alert">Немає доступу до цього розділу.</p>;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Каталог сайту</p>
          <h1 className="mt-2 text-3xl font-semibold">Викладачі</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Чернетки доступні команді. Опубліковані записи бачать відвідувачі
            сайту.
          </p>
        </div>
        {can('teachers.create') && (
          <Button
            disabled={editing !== null || deleteConflict !== null}
            onClick={() => {
              setEditing('new');
              setNotice('');
            }}
          >
            Додати викладача
          </Button>
        )}
      </header>
      {notice && <SuccessNotice>{notice}</SuccessNotice>}
      <ErrorNotice
        error={
          deleteConflict && isVersionConflict(action.error)
            ? undefined
            : action.error
        }
      />
      {deleteConflict && (
        <DeleteConflictNotice
          key={deleteConflict.id}
          readLatest={() => teachersApi.get(deleteConflict.id)}
          onReview={(latest) => {
            setEditing(latest);
            setDeleteConflict(null);
            action.reset();
            void client.invalidateQueries({ queryKey: ['teachers'] });
          }}
          onCancel={() => {
            setDeleteConflict(null);
            action.reset();
          }}
        />
      )}
      {editing && (
        <TeacherForm
          key={editing === 'new' ? 'new' : editing.id + editing.updatedAt}
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(value) => {
            setNotice('Зміни збережено.');
            setEditing(value);
          }}
        />
      )}
      {editing && editing !== 'new' && can('teachers.read') && (
        <TeacherAssignments key={editing.id} teacher={editing} />
      )}
      {can('teachers.read') && (
        <section className="space-y-5 rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Усі записи</h2>
            <Button
              variant="outline"
              disabled={records.isFetching}
              onClick={() => void records.refetch()}
            >
              Оновити
            </Button>
          </div>
          <ErrorNotice error={records.error} />
          {records.isPending ? (
            <p role="status">Завантаження…</p>
          ) : records.data?.items.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Записів поки немає.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-3">Викладач</th>
                    <th className="p-3">Статус</th>
                    <th className="p-3 text-right">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {records.data?.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-3">
                        <p className="font-medium">
                          {item.firstName + ' ' + item.lastName}
                        </p>
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${item.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                        >
                          {item.status === 'PUBLISHED'
                            ? 'Опубліковано'
                            : 'Чернетка'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              editing !== null ||
                              action.isPending ||
                              deleteConflict !== null
                            }
                            onClick={() => {
                              setEditing(item);
                              setNotice('');
                            }}
                          >
                            Відкрити
                          </Button>
                          {can('teachers.publish') && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                action.isPending ||
                                editing !== null ||
                                deleteConflict !== null
                              }
                              onClick={() => perform(item, 'publish')}
                            >
                              {item.status === 'PUBLISHED'
                                ? 'Зняти з публікації'
                                : 'Опублікувати'}
                            </Button>
                          )}
                          {can('teachers.delete') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={
                                action.isPending ||
                                editing !== null ||
                                deleteConflict !== null
                              }
                              onClick={() => perform(item, 'delete')}
                            >
                              Видалити
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={page}
            hasMore={records.data?.hasMore ?? false}
            busy={records.isFetching}
            onChange={setPage}
          />
        </section>
      )}
    </div>
  );
}
