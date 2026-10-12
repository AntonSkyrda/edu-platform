import { createFileRoute, redirect } from '@tanstack/react-router';

import { hasPermission } from '@/features/auth';
import { TeachersPage } from '@/features/teachers';
export const Route = createFileRoute('/_authenticated/teachers')({
  beforeLoad: ({ context }) => {
    if (!(
      hasPermission(context.user, 'teachers.read') ||
      hasPermission(context.user, 'teachers.create')
    ))
      throw redirect({ to: '/' });
  },
  component: TeachersPage,
});
