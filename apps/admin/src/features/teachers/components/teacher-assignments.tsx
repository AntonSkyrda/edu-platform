import type {
  TeacherResponse,
  TeacherSubjectsResponse,
} from '@project/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { usePermissions } from '@/features/auth';
import { SubjectPicker } from '@/features/subjects';
import {
  isVersionConflict,
  useEditConflict,
} from '@/shared/lib/use-edit-conflict';
import { Button } from '@/shared/ui/button';
import { EditConflictNotice } from '@/shared/ui/edit-conflict-notice';
import { ErrorNotice, SuccessNotice } from '@/shared/ui/feedback';

import { teachersApi } from '../api/teachers-api';
export function TeacherAssignments({ teacher }: { teacher: TeacherResponse }) {
  const can = usePermissions();
  const query = useQuery({
    queryKey: ['teacher-subjects', teacher.id],
    queryFn: ({ signal }) => teachersApi.assignments(teacher.id, signal),
  });
  return (
    <section className="space-y-4 rounded-xl border bg-white p-6">
      <h2 className="text-xl font-semibold">Напрями викладача</h2>
      <p className="text-sm text-muted-foreground">
        Зберігаються окремо від опису викладача.
      </p>
      <ErrorNotice error={query.error} />
      {query.isPending && <p role="status">Завантаження…</p>}
      {!can('subjects.read') ? (
        <p>Потрібне право перегляду напрямів.</p>
      ) : (
        query.data && (
          <AssignmentEditor
            teacher={teacher}
            initial={query.data}
            refreshing={query.isFetching}
          />
        )
      )}
    </section>
  );
}
function AssignmentEditor({
  teacher,
  initial,
  refreshing,
}: {
  teacher: TeacherResponse;
  initial: TeacherSubjectsResponse;
  refreshing: boolean;
}) {
  const [value, setValue] = useState(initial.items);
  const client = useQueryClient();
  const conflict = useEditConflict(
    initial,
    async () => {
      const latest = await teachersApi.assignments(teacher.id);
      await client.invalidateQueries({ queryKey: ['subjects'] });
      return latest;
    },
    (record) => ({
      items: [...record.items].sort((a, b) =>
        a.subjectId.localeCompare(b.subjectId),
      ),
    }),
  );
  const can = usePermissions();
  const allowed =
    can('teachers.update') &&
    (teacher.status !== 'PUBLISHED' || can('teachers.publish'));
  const valid =
    value.length <= 50 &&
    value.every(
      (item) =>
        Number.isInteger(item.sortOrder) &&
        item.sortOrder >= 0 &&
        item.sortOrder <= 2147483647,
    );
  const save = useMutation({
    mutationFn: () =>
      teachersApi.setAssignments(teacher.id, value, conflict.record!.version),
    onError: conflict.capture,
    onSuccess: (saved) => {
      conflict.accept(saved);
      setValue(saved.items);
      client.setQueryData(['teacher-subjects', teacher.id], saved);
      void client.invalidateQueries({ queryKey: ['teachers'] });
    },
  });
  return (
    <div className="space-y-4">
      <EditConflictNotice
        {...conflict}
        onReview={() =>
          void conflict.review(
            {
              items: [...value].sort((a, b) =>
                a.subjectId.localeCompare(b.subjectId),
              ),
            },
            (next) => setValue(next.items),
          )
        }
        fields={conflict.fields.map((key) => ({
          key,
          label: 'Напрями викладача',
          local: (
            <SubjectPicker value={value} onChange={() => undefined} disabled />
          ),
          remote: (
            <SubjectPicker
              value={conflict.remote?.items ?? []}
              onChange={() => undefined}
              disabled
            />
          ),
          choose: (source) => {
            if (source === 'remote' && conflict.remote)
              setValue(conflict.remote.items);
            conflict.resolve(key);
          },
        }))}
      />
      <SubjectPicker
        value={value}
        onChange={(next) => {
          setValue(next);
          save.reset();
        }}
        disabled={
          !allowed ||
          save.isPending ||
          conflict.pending ||
          conflict.fields.length > 0
        }
      />
      <ErrorNotice
        error={isVersionConflict(save.error) ? undefined : save.error}
      />
      {!valid && <p role="alert">Порядок має бути цілим невід’ємним числом.</p>}
      {save.isSuccess && <SuccessNotice>Напрями збережено.</SuccessNotice>}
      <Button
        disabled={
          !allowed || !valid || save.isPending || conflict.blocked || refreshing
        }
        onClick={() => {
          if (!conflict.blocked) save.mutate();
        }}
      >
        Зберегти напрями
      </Button>
    </div>
  );
}
