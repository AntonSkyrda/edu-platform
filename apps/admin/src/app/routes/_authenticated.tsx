import { createFileRoute, redirect } from '@tanstack/react-router';

import { sessionOptions } from '@/features/auth';

import { AdminLayout } from '../layouts/admin-layout';
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery(sessionOptions);
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  component: AuthenticatedLayout,
});
function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  return <AdminLayout user={user} />;
}
