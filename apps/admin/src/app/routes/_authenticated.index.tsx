import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, ShieldCheck, Users } from 'lucide-react';
export const Route = createFileRoute('/_authenticated/')({
  component: Dashboard,
});
function Dashboard() {
  const { user } = Route.useRouteContext();
  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-muted-foreground">Панель адміністрування</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Вітаємо, {user.firstName}
      </h1>
      <p className="mt-3 text-muted-foreground">
        Ваш робочий простір для керування платформою.
      </p>
      <section className="mt-10 rounded-xl border bg-white p-7">
        <ShieldCheck className="mb-4 text-emerald-600" />
        <h2 className="text-lg font-semibold">Доступ підтверджено</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ваша роль: {user.role === 'ADMIN' ? 'Адміністратор' : 'Менеджер'}.{' '}
          {user.role === 'ADMIN'
            ? 'Запрошуйте команду та керуйте доступом користувачів.'
            : 'Розділи керування сайтом з’являться тут після їх підключення.'}
        </p>
      </section>
      {user.role === 'ADMIN' && (
        <Link
          to="/users"
          className="mt-6 flex items-center gap-4 rounded-xl border bg-white p-7 transition hover:border-slate-400"
        >
          <Users />
          <div className="flex-1">
            <h2 className="font-semibold">Користувачі та запрошення</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Додавайте учасників і керуйте їхнім доступом.
            </p>
          </div>
          <ArrowUpRight />
        </Link>
      )}
    </div>
  );
}
