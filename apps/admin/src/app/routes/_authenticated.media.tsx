import { createFileRoute, redirect } from '@tanstack/react-router';

import { hasPermission } from '@/features/auth';
import { MediaPage } from '@/features/media';
export const Route = createFileRoute('/_authenticated/media')({
  beforeLoad: ({ context }) => {
    if (!(
      hasPermission(context.user, 'media.read') ||
      hasPermission(context.user, 'media.upload') ||
      hasPermission(context.user, 'media.delete')
    ))
      throw redirect({ to: '/' });
  },
  component: MediaPage,
});
