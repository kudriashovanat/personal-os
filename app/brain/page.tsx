"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, SectionTitle, Input, Badge, Chip, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Search, ExternalLink, FileText, TrendingUp, PenLine, Briefcase, MessageSquare, StickyNote } from "lucide-react";

type Hit = {
  type: string; typeLabel: string; title: string; snippet: string;
  drive_link: string | null; source_url: string | null; created_at: string | null;
};

const TYPES = [
  { id: "files", label: "Files", icon: FileText },
  { id: "trends", label: "HR Trends", icon: TrendingUp },
  { id: "content", label: "Content Ideas", icon: PenLine },
  { id: "career", label: "Career", icon: Briefcase },
  { id: "interviews", label: "Interviews", icon: MessageSquare },
  { id: "notes", label: "Notes", icon: StickyNote },
];
const TYPE_STYLE: Record<string, string> = {
  files: "bg-iris-soft text-iris-deep", trends: "bg-sky-soft text-sky", content: "bg-peach-soft text-peach",
  career: "bg-sage-soft text-sage", interviews: "bg-butter-soft text-butter", notes: "bg-line text-soft",
};
const ruTime = (s: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function BrainSearchPage() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string[]>([]);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits(null); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const types = active.length ? `&types=${active.join(",")}` : "";
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}${types}`);
        const d = await r.json();
        setHits(d.hits ?? []);
      } catch { setHits([]); } finally { setLoading(false); }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, active]);

  function toggle(id: string) {
    setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  const examples = useMemo(() => ["eNPS", "HRBP", "performance review", "карьерная стратегия", "выводы по интервью"], []);

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle eyebrow="Obsidian-first · поиск" title="Second Brain" />

      <Card className="mb-4">
        <div className="flex items-center gap-2">
          <Search size={18} className="shrink-0 text-soft" />
          <Input autoFocus placeholder="Поиск по знаниям: заметки, тренды, файлы, интервью…" value={q} onChange={(e) => setQ(e.target.value)} className="border-0 !px-0 !ring-0 focus:!ring-0" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {TYPES.map((t) => (
            <Chip key={t.id} active={active.includes(t.id)} onClick={() => toggle(t.id)}>{t.label}</Chip>
          ))}
        </div>
      </Card>

      {q.trim().length < 2 ? (
        <Card>
          <Empty title="Спросите свой Second Brain" hint="Введите запрос — поиск идёт по файлам, HR-трендам, идеям, карьере, интервью и заметкам." />
          <div className="flex flex-wrap justify-center gap-1.5 pb-2">
            {examples.map((e) => <Chip key={e} onClick={() => setQ(e)} className="bg-white/70 text-soft hover:text-ink">{e}</Chip>)}
          </div>
        </Card>
      ) : loading && !hits ? (
        <Card><div className="h-24 animate-pulse rounded-xl bg-line/60" /></Card>
      ) : hits && hits.length === 0 ? (
        <Card><Empty title="Ничего не найдено" hint="Попробуйте другой запрос или снимите фильтры по типу." /></Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {hits?.map((h, i) => {
            const T = TYPES.find((t) => t.id === h.type);
            const Icon = T?.icon ?? FileText;
            const link = h.drive_link || h.source_url;
            return (
              <Card key={i} className="flex flex-col gap-1.5">
                <div className="flex items-start gap-2">
                  <Icon size={15} className="mt-0.5 shrink-0 text-soft" />
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-sm font-semibold leading-snug">{h.title}</div>
                    {h.snippet && <div className="mt-0.5 text-sm leading-relaxed text-soft">{h.snippet}</div>}
                  </div>
                  <Badge className={cn("shrink-0", TYPE_STYLE[h.type])}>{h.typeLabel}</Badge>
                </div>
                <div className="flex items-center gap-3 pl-7 text-xs text-soft">
                  {h.created_at && <span>{ruTime(h.created_at)}</span>}
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-iris-deep hover:underline">
                      <ExternalLink size={11} /> {h.drive_link ? "Open in Drive" : "Источник"}
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
