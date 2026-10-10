import type { AuthUser } from '@project/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useRouter } from '@tanstack/react-router';
import { GraduationCap, House, LogOut, Users } from 'lucide-react';

import {
  canAccessAdmin,
  endSession,
  sessionKey,
  sessionOptions,
} from '@/features/auth';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/feedback';
export function AdminLayout({ user }: { user: AuthUser }) {
  const router = useRouter();
  const client = useQueryClient();
  const session = useQuery(sessionOptions);
  const current = session.data ?? user;
  const logout = useMutation({
    mutationFn: endSession,
    onSuccess: async () => {
      await client.cancelQueries();
      client.clear();
      client.setQueryData(sessionKey, null);
      await router.invalidate();
      await router.navigate({ to: '/login' });
    },
  });
  if (!canAccessAdmin(current.role))
    return (
      <main className="mx-auto max-w-lg space-y-6 p-10">
        <h1 className="text-2xl font-semibold">Немає доступу до адмінки</h1>
        <p>Цей обліковий запис не має прав адміністратора або менеджера.</p>
        <ErrorNotice error={logout.error} />
        <Button disabled={logout.isPending} onClick={() => logout.mutate()}>
          Вийти
        </Button>
      </main>
    );
  return (
    <div className="min-h-svh bg-slate-50 md:flex">
      <aside className="flex shrink-0 flex-col bg-slate-950 p-5 text-slate-300 md:fixed md:inset-y-0 md:w-64">
        <Link
          to="/"
          className="mb-8 flex items-center gap-3 text-lg font-semibold text-white"
        >
          <GraduationCap className="text-emerald-400" /> Edu Platform
        </Link>
        <p className="mb-3 text-xs tracking-widest text-slate-500 uppercase">
          Робочий простір
        </p>
        <nav aria-label="Головна навігація" className="flex gap-2 md:flex-col">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: 'bg-white/10 text-white' }}
            className="flex items-center gap-3 rounded-lg p-3 text-sm"
          >
            <House size={18} /> Огляд
          </Link>
          {current.role === 'ADMIN' && (
            <Link
              to="/users"
              activeProps={{ className: 'bg-white/10 text-white' }}
              className="flex items-center gap-3 rounded-lg p-3 text-sm"
            >
              <Users size={18} /> Користувачі
            </Link>
          )}
        </nav>
        <div className="mt-8 space-y-3 border-t border-white/10 pt-5 md:mt-auto">
          <p className="truncate text-sm text-white">
            {current.firstName} {current.lastName}
          </p>
          <p className="truncate text-xs text-slate-500">{current.email}</p>
          <ErrorNotice error={logout.error} />
          <Button
            variant="ghost"
            className="w-full justify-start text-slate-300 hover:bg-white/10 hover:text-white"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut size={16} />
            {logout.isPending ? 'Виходимо…' : 'Вийти'}
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 md:ml-64 md:p-10">
        <ErrorNotice error={session.error} />
        <Outlet />
      </main>
    </div>
  );
}
