"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle, Badge, Button, Empty } from "@/components/ui";
import { TrendingUp, ExternalLink, PenLine, Loader2, Check, Archive } from "lucide-react";

type Trend = {
  id: string; title: string; summary?: string; source_url?: string;
  signal?: string; applied_idea?: string; status: string; created_at: string; drive_link?: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  "новое": "bg-sky-soft text-sky",
  "в работе": "bg-butter-soft text-butter",
  "в контенте": "bg-sage-soft text-sage",
  "архив": "bg-line text-soft",
};

function ruTime(s: string) {
  return new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export default function TrendsPage() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/trends");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setTrends(data.trends);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: string) {
    setTrends((p) => p.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      await fetch(`/api/collection/trends`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }),
      });
    } catch { load(); }
  }

  async function toContent(t: Trend) {
    setBusy(t.id);
    try {
      const r = await fetch("/api/collection/content_ideas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t.title,
          platform: "Telegram",
          topic: t.summary ?? null,
          hook: t.applied_idea ?? null,
          status: "идея",
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      await setStatus(t.id, "в контенте");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle eyebrow="HR Trends Agent" title="HR-тренды" />
      {error && <div className="rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose">{error}</div>}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-soft"><Loader2 size={14} className="animate-spin" /> Загружаю сигналы…</p>
      ) : trends.length === 0 ? (
        <Empty
          icon={<TrendingUp size={20} />}
          title="Сигналов пока нет"
          hint="Откройте «Агенты» и запустите HR Trends — он найдёт свежие тренды и сложит их сюда"
        />
      ) : (
        <div className="space-y-3">
          {trends.map((t) => (
            <Card key={t.id} className="space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg leading-snug">{t.title}</h3>
                <Badge className={STATUS_STYLE[t.status] ?? "bg-line text-soft"}>{t.status}</Badge>
              </div>
              {t.summary && <p className="text-sm leading-relaxed text-ink/80">{t.summary}</p>}
              {t.signal && (
                <p className="rounded-lg bg-iris-soft/50 px-3 py-2 text-sm text-iris-deep">
                  <span className="font-semibold">Сигнал: </span>{t.signal}
                </p>
              )}
              {t.applied_idea && (
                <p className="text-sm italic text-soft">💡 {t.applied_idea}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-2.5 text-xs">
                <span className="text-soft/60">{ruTime(t.created_at)}</span>
                {t.source_url && (
                  <a href={t.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky hover:underline">
                    <ExternalLink size={12} /> источник
                  </a>
                )}
                {t.drive_link && (
                  <a href={t.drive_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-iris-deep hover:underline">
                    <ExternalLink size={12} /> Second Brain
                  </a>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  {t.status !== "архив" && (
                    <button onClick={() => setStatus(t.id, "архив")} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-soft hover:bg-line">
                      <Archive size={12} /> в архив
                    </button>
                  )}
                  <Button variant="soft" onClick={() => toContent(t)} disabled={busy === t.id} className="px-3 py-1.5 text-xs">
                    {busy === t.id ? <Loader2 size={13} className="animate-spin" /> : <><PenLine size={12} className="mr-1" /> В Контент-студию</>}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
