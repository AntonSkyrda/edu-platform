import { GraduationCap } from 'lucide-react';
import type { ReactNode } from 'react';
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-svh bg-slate-50 lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-slate-950 p-14 text-white lg:flex">
        <div className="flex items-center gap-3 text-xl font-semibold">
          <GraduationCap size={32} /> Edu Platform
        </div>
        <div className="max-w-md">
          <div className="mb-6 h-1 w-12 bg-emerald-400" />
          <h2 className="text-5xl leading-tight font-semibold tracking-tight">
            Більше простору
            <br />
            для навчання.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-slate-400">
            Керуйте платформою та командою в одному місці.
          </p>
        </div>
        <p className="text-sm text-slate-500">Панель адміністрування</p>
      </aside>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-2 font-semibold lg:hidden">
            <GraduationCap /> Edu Platform
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {children}
        </div>
      </section>
    </main>
  );
}
