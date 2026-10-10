import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Link,
  Outlet,
  useRouter,
} from '@tanstack/react-router';

import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/feedback';
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: () => <Outlet />,
    pendingComponent: () => (
      <div
        role="status"
        className="grid min-h-svh place-items-center text-muted-foreground"
      >
        Завантаження…
      </div>
    ),
    errorComponent: RouteError,
    notFoundComponent: () => (
      <main className="grid min-h-svh place-content-center gap-6 text-center">
        <h1 className="text-2xl font-semibold">Сторінку не знайдено</h1>
        <Link to="/" className="underline">
          На головну
        </Link>
      </main>
    ),
  },
);

function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-lg space-y-6 p-8">
      <h1 className="text-2xl font-semibold">
        Не вдалося завантажити сторінку
      </h1>
      <ErrorNotice error={error} />
      <Button
        onClick={() => {
          void router.invalidate().then(reset);
        }}
      >
        Спробувати ще раз
      </Button>
    </main>
  );
}
