import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return <h1 className="text-3xl font-bold">Edu Platform Admin</h1>;
}
