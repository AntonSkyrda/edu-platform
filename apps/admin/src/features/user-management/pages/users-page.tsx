import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/shared/ui/button';
import { ErrorNotice, SuccessNotice } from '@/shared/ui/feedback';

import { usersApi } from '../api/users-api';
import { InviteForm } from '../components/invite-form';
import { roleLabels, statusLabels } from '../model/schemas';
export function UsersPage() {
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const users = useQuery({
    queryKey: ['users', page],
    queryFn: ({ signal }) => usersApi.list(page, signal),
  });
  const action = useMutation({
    mutationFn: usersApi.action,
    onSuccess: () => client.invalidateQueries({ queryKey: ['users'] }),
  });
  function act(id: string, operation: 'resend' | 'block' | 'unblock') {
    const message =
      operation === 'block'
        ? 'Заблокувати користувача? Його сесії та запрошення буде відкликано.'
        : operation === 'unblock'
          ? 'Розблокувати користувача? Для неактивованого акаунта потрібно повторно надіслати запрошення.'
          : 'Надіслати нове запрошення? Попереднє посилання стане недійсним.';
    if (window.confirm(message)) action.mutate({ id, action: operation });
  }
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">Керування доступом</p>
        <h1 className="mt-2 text-3xl font-semibold">Користувачі</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Запрошуйте команду, повторно надсилайте запрошення та керуйте
          доступом.
        </p>
      </header>
      <InviteForm />
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="font-semibold">Учасники платформи</h2>
          <Button
            variant="outline"
            disabled={users.isFetching}
            onClick={() => void users.refetch()}
          >
            Оновити
          </Button>
        </div>
        <div className="space-y-3 p-5">
          <ErrorNotice error={users.error || action.error} />
          {action.isSuccess && (
            <SuccessNotice>
              {action.variables.action === 'resend'
                ? 'Новий лист поставлено в чергу.'
                : action.variables.action === 'unblock'
                  ? 'Доступ відновлено. Якщо акаунт не активовано, надішліть запрошення повторно.'
                  : 'Користувача заблоковано.'}
            </SuccessNotice>
          )}
          {users.isPending ? (
            <p role="status">Завантаження користувачів…</p>
          ) : users.data?.items.length === 0 ? (
            <p>Користувачів поки немає.</p>
          ) : (
            users.data && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Користувач</th>
                      <th className="px-3">Роль</th>
                      <th className="px-3">Статус</th>
                      <th className="px-3 text-right">Дії</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.data.items.map((user) => (
                      <tr key={user.id} className="border-t">
                        <td className="px-3 py-4">
                          <p className="font-medium">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {user.email}
                          </p>
                        </td>
                        <td className="px-3">{roleLabels[user.role]}</td>
                        <td className="px-3">
                          <span
                            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${user.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : user.status === 'BLOCKED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}
                          >
                            {statusLabels[user.status]}
                          </span>
                        </td>
                        <td className="px-3">
                          <div className="flex justify-end gap-2">
                            {user.status === 'INVITED' && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={action.isPending}
                                onClick={() => act(user.id, 'resend')}
                              >
                                Повторити лист
                              </Button>
                            )}
                            {user.role !== 'ADMIN' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={action.isPending}
                                onClick={() =>
                                  act(
                                    user.id,
                                    user.status === 'BLOCKED'
                                      ? 'unblock'
                                      : 'block',
                                  )
                                }
                              >
                                {user.status === 'BLOCKED'
                                  ? 'Розблокувати'
                                  : 'Заблокувати'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
        <footer className="flex items-center justify-between border-t p-5">
          <Button
            variant="outline"
            disabled={page === 0 || users.isFetching}
            onClick={() => setPage(page - 1)}
          >
            Назад
          </Button>
          <span className="text-sm text-muted-foreground">
            Сторінка {page + 1}
          </span>
          <Button
            variant="outline"
            disabled={!users.data?.hasMore || users.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Далі
          </Button>
        </footer>
      </section>
    </div>
  );
}
