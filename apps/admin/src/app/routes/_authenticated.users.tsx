import { createFileRoute, redirect } from '@tanstack/react-router';

import { UsersPage } from '@/features/user-management';
export const Route = createFileRoute('/_authenticated/users')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'ADMIN') throw redirect({ to: '/' });
  },
  component: UsersPage,
});
