import { createFileRoute } from '@tanstack/react-router';

import { SetPasswordPage } from '@/features/auth';
export const Route = createFileRoute('/accept-invitation')({
  component: () => <SetPasswordPage mode="invitation" />,
});
