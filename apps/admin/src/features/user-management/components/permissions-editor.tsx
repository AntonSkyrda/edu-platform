import {
  type AuthUser,
  type Permission,
  PERMISSIONS,
  type PermissionsResponse,
} from '@project/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { sessionKey } from '@/features/auth';
import {
  isVersionConflict,
  useEditConflict,
} from '@/shared/lib/use-edit-conflict';
import { Button } from '@/shared/ui/button';
import { EditConflictNotice } from '@/shared/ui/edit-conflict-notice';
import { ErrorNotice, SuccessNotice } from '@/shared/ui/feedback';

import { usersApi } from '../api/users-api';
import { permissionLabels } from '../model/permission-labels';
export function PermissionsEditor({
  user,
  onClose,
}: {
  user: AuthUser;
  onClose: () => void;
}) {
  const permissions = useQuery({
    queryKey: ['user-permissions', user.id],
    queryFn: ({ signal }) => usersApi.permissions(user.id, signal),
  });
  return (
    <section className="space-y-4 rounded-xl border bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Права: {user.firstName} {user.lastName}
        </h2>
        <Button variant="ghost" onClick={onClose}>
          Закрити права
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Права незалежні. Для роботи зі списком додайте перегляд; для зміни
        опублікованих записів — публікацію. Права на файли відкривають спільні
        матеріали команди.
      </p>
      <ErrorNotice error={permissions.error} />
      {permissions.isPending && <p role="status">Завантаження прав…</p>}
      {permissions.data && (
        <PermissionForm userId={user.id} initial={permissions.data} />
      )}
    </section>
  );
}
function PermissionForm({
  userId,
  initial,
}: {
  userId: string;
  initial: PermissionsResponse;
}) {
  const [selected, setSelected] = useState(initial.permissions);
  const conflict = useEditConflict(
    initial,
    () => usersApi.permissions(userId),
    permissionValues,
  );
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      usersApi.setPermissions(userId, selected, conflict.record!.version),
    onError: conflict.capture,
    onSuccess: async (value) => {
      conflict.accept(value);
      setSelected(value.permissions);
      client.setQueryData(['user-permissions', userId], value);
      await client.invalidateQueries({ queryKey: sessionKey });
    },
  });
  return (
    <div className="space-y-5">
      <EditConflictNotice
        {...conflict}
        onReview={() =>
          void conflict.review(
            permissionValues({ permissions: selected }),
            (next) => setSelected(next.permissions),
          )
        }
        fields={conflict.fields.map((key) => ({
          key,
          label: 'Права доступу',
          local: <PermissionList permissions={selected} />,
          remote: (
            <PermissionList permissions={conflict.remote?.permissions ?? []} />
          ),
          choose: (source) => {
            if (source === 'remote' && conflict.remote)
              setSelected(conflict.remote.permissions);
            conflict.resolve(key);
          },
        }))}
      />
      {conflict.fields.length > 0 && (
        <p className="text-sm">
          Перевірте весь набір прав: вибір власного набору може повернути права,
          які інший адміністратор відкликав.
        </p>
      )}
      <fieldset
        disabled={
          save.isPending || conflict.pending || conflict.fields.length > 0
        }
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <legend className="sr-only">Дозволені дії</legend>
        {PERMISSIONS.map((permission) => (
          <label
            key={permission}
            className="flex items-center gap-3 rounded-lg border p-3 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(permission)}
              onChange={(event) => {
                setSelected((current) =>
                  event.target.checked
                    ? [...current, permission]
                    : current.filter((item) => item !== permission),
                );
                save.reset();
              }}
            />
            {permissionLabels[permission]}
          </label>
        ))}
      </fieldset>
      <ErrorNotice
        error={isVersionConflict(save.error) ? undefined : save.error}
      />
      {save.isSuccess && <SuccessNotice>Права збережено.</SuccessNotice>}
      <div className="flex gap-3">
        <Button
          disabled={save.isPending || conflict.blocked}
          onClick={() => {
            if (
              !conflict.blocked &&
              (selected.length ||
                window.confirm('Відкликати всі права менеджера?'))
            )
              save.mutate();
          }}
        >
          Зберегти права
        </Button>
        <Button
          variant="outline"
          disabled={save.isPending || conflict.blocked}
          onClick={() => {
            setSelected([]);
            save.reset();
          }}
        >
          Зняти всі позначки
        </Button>
      </div>
    </div>
  );
}

// A grant set is reviewed as a whole: never merge privileges automatically.
const permissionValues = (
  record: Pick<PermissionsResponse, 'permissions'>,
) => ({
  permissions: PERMISSIONS.filter((permission) =>
    record.permissions.includes(permission),
  ),
});
function PermissionList({ permissions }: { permissions: Permission[] }) {
  return permissions.length ? (
    <ul>
      {permissions.map((permission) => (
        <li key={permission}>{permissionLabels[permission]}</li>
      ))}
    </ul>
  ) : (
    <span>Усі права відкликано</span>
  );
}
