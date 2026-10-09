import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <Outlet />
    </main>
  );
}

function NotFoundPage() {
  return <h1 className="text-2xl font-bold">Сторінку не знайдено</h1>;
}
