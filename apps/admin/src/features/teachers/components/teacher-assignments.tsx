import type {
  TeacherResponse,
  TeacherSubjectAssignment,
} from '@project/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { usePermissions } from '@/features/auth';
import { SubjectPicker } from '@/features/subjects';
import { Button } from '@/shared/ui/button';
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
          <AssignmentEditor teacher={teacher} initial={query.data} />
        )
      )}
    </section>
  );
}
function AssignmentEditor({
  teacher,
  initial,
}: {
  teacher: TeacherResponse;
  initial: TeacherSubjectAssignment[];
}) {
  const [value, setValue] = useState(initial);
  const client = useQueryClient();
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
    mutationFn: () => teachersApi.setAssignments(teacher.id, value),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['teacher-subjects', teacher.id] }),
  });
  return (
    <div className="space-y-4">
      <SubjectPicker
        value={value}
        onChange={(next) => {
          setValue(next);
          save.reset();
        }}
        disabled={!allowed || save.isPending}
      />
      <ErrorNotice error={save.error} />
      {!valid && <p role="alert">Порядок має бути цілим невід’ємним числом.</p>}
      {save.isSuccess && <SuccessNotice>Напрями збережено.</SuccessNotice>}
      <Button
        disabled={!allowed || !valid || save.isPending}
        onClick={() => save.mutate()}
      >
        Зберегти напрями
      </Button>
    </div>
  );
}
