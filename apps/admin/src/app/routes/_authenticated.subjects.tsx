import { createFileRoute, redirect } from '@tanstack/react-router';

import { hasPermission } from '@/features/auth';
import { SubjectsPage } from '@/features/subjects';
export const Route = createFileRoute('/_authenticated/subjects')({
  beforeLoad: ({ context }) => {
    if (!(
      hasPermission(context.user, 'subjects.read') ||
      hasPermission(context.user, 'subjects.create')
    ))
      throw redirect({ to: '/' });
  },
  component: SubjectsPage,
});
