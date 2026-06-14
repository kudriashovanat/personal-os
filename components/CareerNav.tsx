"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Под-навигация карьерного контура: CRM · Аналитика · Профиль · Языки.
const TABS = [
  { href: "/career", label: "CRM" },
  { href: "/career/analytics", label: "Аналитика" },
  { href: "/profile", label: "Профиль" },
  { href: "/learning", label: "Языки" },
];

export function CareerNav() {
  const p = usePathname() || "";
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {TABS.map((t) => {
        const active = t.href === "/career" ? p === "/career" : p.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              active ? "bg-ink text-white" : "bg-white/60 text-soft hover:text-ink"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
