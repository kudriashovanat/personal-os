"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, SectionTitle, Button, Badge, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Analytics } from "@/lib/analytics";
import { ArrowLeft, TrendingUp, AlertTriangle, Send } from "lucide-react";

export default function CareerAnalyticsPage() {
  const [a, setA] = useState<Analytics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/career/analytics")
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setA(d)))
      .catch(() => setErr("Не удалось загрузить аналитику"));
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <SectionTitle
        eyebrow="Поиск работы"
        title="Аналитика откликов"
        action={<Link href="/career"><Button variant="ghost"><ArrowLeft size={15} /> К доске</Button></Link>}
      />

      {err && <Card><Empty title="Ошибка" hint={err} /></Card>}
      {!a && !err && <Card><div className="h-32 animate-pulse rounded-xl bg-line/60" /></Card>}

      {a && (
        <div className="flex flex-col gap-4">
          <Insights a={a} />

          <DueList due={a.actionsDue} />

          {/* KPI-ряд */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Откликов/день (7д)" value={a.appsPerDay.last7Avg} suffix={`/ ${a.appsPerDay.target}`}
              tone={a.appsPerDay.last7Avg >= a.appsPerDay.target ? "good" : "warn"} />
            <Kpi label="Откликов всего" value={a.totals.applied} suffix={`из ${a.totals.found} найдено`} />
            <Kpi label="В работе" value={a.totals.active} suffix="ждут ответа" />
            <Kpi label="Средний fit (откликнутые)" value={a.fit.appliedAvg ?? "—"} suffix={a.fit.disciplinePct != null ? `${a.fit.disciplinePct}% ≥7` : ""}
              tone={a.fit.appliedAvg != null && a.fit.appliedAvg < 6 ? "warn" : undefined} />
          </div>

          {/* Отклики по дням */}
          <Card>
            <Header icon={<TrendingUp size={15} />} title="Темп откликов · 14 дней" />
            <DayBars series={a.appsPerDay.series} target={a.appsPerDay.target} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Воронка */}
            <Card>
              <Header title="Пайплайн по стадиям" />
              <div className="flex flex-col gap-1.5">
                {a.pipeline.map((p) => {
                  const max = Math.max(1, ...a.pipeline.map((x) => x.count));
                  return (
                    <div key={p.status} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-xs text-soft">{p.status}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded-md bg-line/50">
                        <div className="h-full rounded-md bg-iris/70" style={{ width: `${(p.count / max) * 100}%` }} />
                      </div>
                      <span className="w-6 text-right text-xs font-semibold tabular-nums">{p.count}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Позиционирование */}
            <Card>
              <Header title="Позиционная смесь" subtitle="монитор over-leveling (узкое место №1)" />
              {a.positioning.overLevelingPct == null ? (
                <p className="text-sm text-soft">Появится, когда у откликов будет level_match (после скоринга с профилем).</p>
              ) : (
                <>
                  <div className="mb-3 flex items-end gap-2">
                    <span className={cn("font-display text-4xl font-bold", a.positioning.overLevelingPct >= 30 ? "text-rose" : "text-sage")}>
                      {a.positioning.overLevelingPct}%
                    </span>
                    <span className="pb-1.5 text-sm text-soft">откликов «выше уровня»</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge className="bg-sage-soft text-sage">в уровне: {a.positioning.at}</Badge>
                    <Badge className="bg-butter-soft text-butter">ниже: {a.positioning.below}</Badge>
                    <Badge className="bg-rose-soft text-rose">выше: {a.positioning.above}</Badge>
                    {a.positioning.unknown > 0 && <Badge className="bg-line text-soft">без оценки: {a.positioning.unknown}</Badge>}
                  </div>
                </>
              )}
            </Card>
          </div>

          <ColdList cold={a.cold} />

          {/* Гейтинг конверсий */}
          <Card>
            <Header title="Конверсии воронки" subtitle="раскрываются по мере накопления данных" />
            {a.confidence.enoughForConversion ? (
              <p className="text-sm text-soft">Данных достаточно ({a.confidence.applied} откликов). Слой конверсий и источников — следующий шаг.</p>
            ) : (
              <p className="text-sm text-soft">
                Пока <b>{a.confidence.applied}</b> откликов. Конверсии screening/interview/offer на таком объёме —
                статистический шум, поэтому скрыты до ~15 точек. Сейчас фокус на темпе и позиционировании выше.
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// --- Детерминированные выводы (без LLM): что ограничивает оффер прямо сейчас ---
function Insights({ a }: { a: Analytics }) {
  const out: { tone: "warn" | "info"; text: string }[] = [];
  if (a.appsPerDay.last7Avg < a.appsPerDay.target) {
    out.push({ tone: "warn", text: `Темп — узкое место: ${a.appsPerDay.last7Avg} откликов/день против цели ${a.appsPerDay.target}. Это сильнее всего ограничивает шанс оффера сейчас.` });
  }
  if (a.positioning.overLevelingPct != null && a.positioning.overLevelingPct >= 30) {
    out.push({ tone: "warn", text: `Over-leveling: ${a.positioning.overLevelingPct}% откликов помечены «выше уровня». Их режут как «дорого/выше роли» — переориентируйся на HRBP/People Partner.` });
  }
  if (a.fit.disciplinePct != null && a.fit.disciplinePct < 50) {
    out.push({ tone: "warn", text: `Fit-дисциплина низкая: только ${a.fit.disciplinePct}% откликов на роли с fit ≥7. Откликов много, но не на лучшие совпадения.` });
  }
  const overdue = a.actionsDue.filter((d) => d.overdue).length;
  if (a.actionsDue.length > 0) {
    out.push({ tone: overdue ? "warn" : "info", text: `${a.actionsDue.length} действий на сегодня${overdue ? ` (${overdue} просрочено)` : ""}. Список — «Сделать сегодня».` });
  }
  if (a.cold.length > 0) {
    out.push({ tone: "info", text: `${a.cold.length} заявок остыли (нет ответа неделю+). Follow-up по ним — ниже.` });
  }
  if (!out.length) out.push({ tone: "info", text: "Базовых тревог нет. Держи темп и следи за позиционированием." });

  return (
    <Card strong>
      <Header icon={<AlertTriangle size={15} className="text-iris" />} title="Что ограничивает оффер" />
      <ul className="flex flex-col gap-2">
        {out.map((i, k) => (
          <li key={k} className="flex gap-2 text-sm leading-relaxed">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", i.tone === "warn" ? "bg-rose" : "bg-sky")} />
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DueList({ due }: { due: Analytics["actionsDue"] }) {
  if (!due.length) return null;
  return (
    <Card>
      <Header title="Сделать сегодня" subtitle="next_action со сроком на сегодня или просроченные" />
      <div className="flex flex-col gap-2">
        {due.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line/70 p-2.5 text-sm">
            <span className="font-semibold">{d.title}</span>
            {d.company && <span className="text-xs text-soft">{d.company}</span>}
            {d.action && <span className="text-soft">— {d.action}</span>}
            <Badge className={cn("ml-auto", d.overdue ? "bg-rose-soft text-rose" : "bg-butter-soft text-butter")}>{d.overdue ? `просрочено · ${d.date}` : d.date}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Header({ icon, title, subtitle }: { icon?: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      {icon}
      <span className="font-display text-base font-semibold">{title}</span>
      {subtitle && <span className="text-xs text-soft">· {subtitle}</span>}
    </div>
  );
}

function Kpi({ label, value, suffix, tone }: { label: string; value: React.ReactNode; suffix?: string; tone?: "good" | "warn" }) {
  return (
    <Card>
      <div className="text-xs text-soft">{label}</div>
      <div className={cn("mt-1 font-display text-3xl font-bold tabular-nums", tone === "good" && "text-sage", tone === "warn" && "text-rose")}>{value}</div>
      {suffix && <div className="mt-0.5 text-xs text-soft">{suffix}</div>}
    </Card>
  );
}

function DayBars({ series, target }: { series: { date: string; count: number }[]; target: number }) {
  const max = Math.max(target, ...series.map((s) => s.count), 1);
  return (
    <div className="flex h-28 items-end gap-1.5">
      {series.map((s) => (
        <div key={s.date} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end">
            <div className={cn("w-full rounded-t", s.count >= target ? "bg-sage" : "bg-iris/60")}
              style={{ height: `${(s.count / max) * 100}%`, minHeight: s.count ? 3 : 0 }} title={`${s.date}: ${s.count}`} />
          </div>
          <span className="text-[9px] text-soft">{s.date.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

function ColdList({ cold }: { cold: Analytics["cold"] }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function draft(id: string) {
    setLoading(id);
    try {
      const r = await fetch("/api/career/followup", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      const d = await r.json();
      setDrafts((p) => ({ ...p, [id]: d.error ? `Ошибка: ${d.error}` : d.message }));
    } catch {
      setDrafts((p) => ({ ...p, [id]: "Ошибка генерации" }));
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card>
      <Header icon={<Send size={15} />} title="Остывшие заявки" subtitle="нет ответа неделю+ · follow-up двигает офферы сильнее графиков" />
      {cold.length === 0 ? (
        <p className="text-sm text-soft">Остывших заявок нет — все свежие или уже продвинулись.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {cold.map((c) => (
            <div key={c.id} className="rounded-xl border border-line/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm">{c.title}</span>
                {c.company && <span className="text-xs text-soft">{c.company}</span>}
                <Badge className="bg-rose-soft text-rose">{c.agingDays} дн. тишины</Badge>
                <span className="text-xs text-soft">· {c.status}</span>
                <Button variant="soft" className="ml-auto !py-1 text-xs" onClick={() => draft(c.id)} disabled={loading === c.id}>
                  {loading === c.id ? "Пишу…" : "Черновик follow-up"}
                </Button>
              </div>
              {drafts[c.id] && (
                <div className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 p-2.5 text-sm leading-relaxed">{drafts[c.id]}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
