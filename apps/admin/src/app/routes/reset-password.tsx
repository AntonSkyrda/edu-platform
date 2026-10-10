import { createFileRoute } from '@tanstack/react-router';

import { SetPasswordPage } from '@/features/auth';
export const Route = createFileRoute('/reset-password')({
  component: () => <SetPasswordPage mode="recovery" />,
});
