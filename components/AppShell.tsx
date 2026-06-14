"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Sun, CheckSquare, LayoutGrid, CalendarDays, Briefcase, TrendingUp, PenLine,
  Brain, Share2, HeartHandshake, Target, Users, Bot, FolderUp, LogOut, Menu, X, Feather, Languages, Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickNote } from "@/components/QuickNote";

const NAV = [
  { href: "/", label: "Сегодня", icon: Sun },
  { href: "/planner", label: "Планер", icon: CheckSquare },
  { href: "/matrix", label: "Матрица", icon: LayoutGrid },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/career", label: "Карьера", icon: Briefcase },
  { href: "/learning", label: "Языки", icon: Languages },
  { href: "/trends", label: "HR-тренды", icon: TrendingUp },
  { href: "/ideas", label: "Идеи", icon: Lightbulb },
  { href: "/content", label: "Контент-студия", icon: PenLine },
  { href: "/brain", label: "Second Brain", icon: Brain },
  { href: "/graph", label: "Карта знаний", icon: Share2 },
  { href: "/gratitude", label: "Благодарность", icon: HeartHandshake },
  { href: "/goals", label: "Цели", icon: Target },
  { href: "/crm", label: "Люди", icon: Users },
  { href: "/agents", label: "Агенты", icon: Bot },
  { href: "/files", label: "Файлы", icon: FolderUp },
];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  // Гард доступа на клиенте: работает через /api/auth/session (Node-runtime),
  // не зависит от Edge middleware. Данные дополнительно защищены проверкой
  // сессии в каждом API-маршруте, а allowlist — при создании сессии (lib/auth.ts).
  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/login") {
      window.location.replace("/login?callbackUrl=" + encodeURIComponent(pathname || "/"));
    }
  }, [status, pathname]);

  if (pathname === "/login") return <>{children}</>;

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2.5 text-soft">
          <span className="h-2 w-2 animate-pulse rounded-full bg-iris" />
          <span className="text-sm">Открываю Personal OS…</span>
        </div>
      </div>
    );
  }

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-white text-ink shadow-card" : "text-soft hover:bg-white/60 hover:text-ink"
            )}
          >
            <Icon size={17} strokeWidth={2} className={active ? "text-iris" : ""} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1320px]">
      {/* Сайдбар — desktop */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 overflow-y-auto px-4 py-6 lg:flex">
        <Link href="/" className="flex items-center gap-2 px-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-iris text-white shadow-card">
            <Feather size={16} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Personal OS</span>
        </Link>
        {nav}
        <div className="mt-auto px-3">
          {session?.user && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-soft transition-colors hover:bg-white/60 hover:text-ink"
            >
              <LogOut size={15} /> Выйти
            </button>
          )}
        </div>
      </aside>

      {/* Шапка — mobile */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-iris text-white shadow-card">
              <Feather size={15} />
            </span>
            <span className="font-display text-base font-semibold">Personal OS</span>
          </Link>
          <button
            aria-label="Меню"
            onClick={() => setMenuOpen((v) => !v)}
            className="glass flex h-10 w-10 items-center justify-center !rounded-xl"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </header>

        {menuOpen && (
          <div className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)}>
            <div className="glass-strong absolute right-3 top-3 w-64 p-3" onClick={(e) => e.stopPropagation()}>
              {nav}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-soft hover:bg-white/60"
              >
                <LogOut size={15} /> Выйти
              </button>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 pb-28 pt-2 lg:px-8 lg:pt-8">{children}</main>
      </div>

      <QuickNote />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
