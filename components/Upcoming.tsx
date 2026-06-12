"use client";

import { Card, SectionTitle } from "@/components/ui";
import { CircleDashed } from "lucide-react";

export function Upcoming({
  eyebrow, title, block, description, items,
}: {
  eyebrow: string; title: string; block: string; description: string; items: string[];
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle eyebrow={eyebrow} title={title} />
      <Card className="bg-gradient-to-br from-iris-soft/40 to-white/60">
        <div className="mb-1 flex items-center gap-2 text-iris-deep">
          <CircleDashed size={16} />
          <span className="text-xs font-bold uppercase tracking-wide">{block}</span>
        </div>
        <p className="text-sm leading-relaxed text-ink/80">{description}</p>
      </Card>
      <Card className="mt-4">
        <div className="eyebrow mb-3">Что здесь появится</div>
        <ul className="space-y-2.5">
          {items.map((it) => (
            <li key={it} className="flex items-start gap-2.5 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-iris" />
              {it}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
