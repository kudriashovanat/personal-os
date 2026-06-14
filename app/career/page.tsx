"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, SectionTitle, Button, Input, Select, Textarea, Badge, Chip, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CAREER_STATUSES, normalizeStatus, DEFAULT_NEW_STATUS, DIMENSION_AXES, ROUND_TYPES, ROUND_LABEL, type CareerStatus } from "@/lib/career";
import type { Calibration, InterviewPrep, InterviewAnalysis, DebriefPattern, RejectionClassification } from "@/lib/agents";
import { CareerNav } from "@/components/CareerNav";

const LIKELIHOOD_META: Record<string, string> = {
  high: "bg-rose-soft text-rose", medium: "bg-butter-soft text-butter", low: "bg-line text-soft",
};
import { ExternalLink, Trash2, Languages, X, Sparkles, BarChart3, Compass } from "lucide-react";

const VERDICT_META: Record<Calibration["verdict"], { label: string; cls: string }> = {
  apply: { label: "Откликаться", cls: "bg-sage-soft text-sage" },
  reframe: { label: "Переформулировать", cls: "bg-butter-soft text-butter" },
  skip: { label: "Пропустить", cls: "bg-rose-soft text-rose" },
};

type LevelMatch = "below" | "at" | "above";

type Item = {
  id: string;
  title: string;
  company: string | null;
  link: string | null;
  bucket: string | null;
  country: string | null;
  remote: boolean;
  level: string | null;
  hebrew_required: boolean;
  language: string | null;
  status: string;
  notes: string | null;
  // Поля Career CRM (могут отсутствовать, пока миграция не применена — тогда undefined).
  source?: string | null;
  salary?: string | null;
  fit_score?: number | null;
  fit_reason?: string | null;
  fit_risks?: string | null;
  to_strengthen?: string | null;
  level_match?: LevelMatch | null;
  application_date?: string | null;
  recruiter_name?: string | null;
  recruiter_email?: string | null;
  recruiter_linkedin?: string | null;
  hiring_manager?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
};

// Цвета колонок/бейджей по статусу.
const STATUS_META: Record<CareerStatus, { dot: string; badge: string }> = {
  "Новые": { dot: "bg-sky", badge: "bg-sky-soft text-sky" },
  "Шортлист": { dot: "bg-iris", badge: "bg-iris-soft text-iris-deep" },
  "Откликнулась": { dot: "bg-butter", badge: "bg-butter-soft text-butter" },
  "Скрининг": { dot: "bg-peach", badge: "bg-peach-soft text-peach" },
  "Интервью": { dot: "bg-iris-deep", badge: "bg-iris-soft text-iris-deep" },
  "Финал": { dot: "bg-sage", badge: "bg-sage-soft text-sage" },
  "Оффер": { dot: "bg-sage", badge: "bg-sage text-white" },
  "Отказ": { dot: "bg-rose", badge: "bg-rose-soft text-rose" },
  "Архив": { dot: "bg-line", badge: "bg-line text-soft" },
};

const LEVEL_MATCH_META: Record<LevelMatch, { label: string; cls: string }> = {
  below: { label: "ниже уровня", cls: "bg-butter-soft text-butter" },
  at: { label: "в уровне", cls: "bg-sage-soft text-sage" },
  above: { label: "выше уровня", cls: "bg-rose-soft text-rose" }, // риск over-leveling
};

function fitColor(score: number): string {
  if (score >= 8) return "text-sage";
  if (score >= 5) return "text-butter";
  return "text-rose";
}

const BUCKETS = ["Высокий приоритет", "Вход на рынок Израиля", "Пограничные варианты"];

function extractFirstUrl(s: string): string | null {
  const m = s.match(/https?:\/\/\S+/i);
  return m ? m[0] : null;
}

export default function CareerPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fRemote, setFRemote] = useState(false);
  const [adding, setAdding] = useState(false);
  const [paste, setPaste] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const emptyForm = { title: "", company: "", link: "", country: "", level: "", language: "", notes: "", remote: false, hebrew_required: false };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetch("/api/collection/career_items").then((r) => (r.ok ? r.json() : [])).then(setItems).catch(() => setItems([]));
  }, []);

  async function patch(id: string, p: Partial<Item>) {
    setItems((prev) => (prev ?? []).map((i) => (i.id === id ? { ...i, ...p } : i)));
    await fetch("/api/collection/career_items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...p }),
    });
    // NB: ручная смена статуса пока НЕ пишет career_status_history (нужен отдельный route — Sprint 4).
  }

  async function remove(id: string) {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== id));
    if (openId === id) setOpenId(null);
    await fetch("/api/collection/career_items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  // AI-заполнение формы из вставленной ссылки/текста (БД не трогает).
  async function aiFill() {
    const value = paste.trim();
    if (!value) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const isUrl = /^https?:\/\/\S+$/i.test(value);
      const r = await fetch("/api/career/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isUrl ? { link: value } : { text: value, link: extractFirstUrl(value) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось разобрать");
      setForm({
        title: d.title ?? "", company: d.company ?? "", link: d.link ?? (isUrl ? value : ""),
        country: d.country ?? "", level: d.level ?? "", language: d.language ?? "",
        notes: [d.notes, d.salary ? `Зарплата: ${d.salary}` : null].filter(Boolean).join("\n") || "",
        remote: Boolean(d.remote), hebrew_required: Boolean(d.hebrew_required),
      });
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function add() {
    if (!form.title.trim()) return;
    // Только колонки, гарантированно существующие в схеме сегодня (прод-безопасно до миграции).
    const body = {
      title: form.title.trim(),
      company: form.company || null,
      link: form.link || null,
      country: form.country || null,
      level: form.level || null,
      language: form.language || null,
      remote: form.remote,
      hebrew_required: form.hebrew_required,
      notes: form.notes || null,
      bucket: BUCKETS[0],
      status: DEFAULT_NEW_STATUS,
    };
    const r = await fetch("/api/collection/career_items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const created = await r.json();
      setItems((p) => [created, ...(p ?? [])]);
      setForm(emptyForm);
      setPaste("");
      setAdding(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((i) => {
      if (fRemote && !i.remote) return false;
      if (!needle) return true;
      return [i.title, i.company, i.country, i.source].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [items, q, fRemote]);

  // Группировка по канону статуса (легаси сворачивается в канон на чтении).
  const byStatus = useMemo(() => {
    const map = new Map<CareerStatus, Item[]>();
    for (const s of CAREER_STATUSES) map.set(s, []);
    for (const it of filtered) map.get(normalizeStatus(it.status))!.push(it);
    // Внутри колонки — по fit_score убыв., затем без оценки.
    Array.from(map.values()).forEach((arr) => {
      arr.sort((a: Item, b: Item) => (b.fit_score ?? -1) - (a.fit_score ?? -1));
    });
    return map;
  }, [filtered]);

  const open = openId ? (items ?? []).find((i) => i.id === openId) ?? null : null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <CareerNav />
      <SectionTitle
        eyebrow="Поиск работы"
        title="Карьера"
        action={
          <div className="flex items-center gap-2">
            <Link href="/career/analytics"><Button variant="soft"><BarChart3 size={15} /> Аналитика</Button></Link>
            <Button variant={adding ? "ghost" : "primary"} onClick={() => setAdding((v) => !v)}>{adding ? "Отмена" : "+ Вакансия"}</Button>
          </div>
        }
      />

      {adding && (
        <Card className="mb-4">
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-soft">
              <Sparkles size={13} className="text-iris" /> Вставьте ссылку на вакансию или её текст — AI заполнит поля
            </div>
            <Textarea rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="https://… или текст описания вакансии" />
            <div className="mt-2 flex items-center gap-2">
              {aiError && <span className="text-xs text-rose">{aiError}</span>}
              <Button variant="soft" onClick={aiFill} disabled={!paste.trim() || aiLoading} className="ml-auto">
                {aiLoading ? "Разбираю…" : "Заполнить через AI"}
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Роль (например, HRBP)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input placeholder="Компания" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            <Input placeholder="Ссылка на вакансию" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
            <Input placeholder="Страна / локация" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            <Input placeholder="Уровень" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
            <Input placeholder="Язык работы" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
          </div>
          <Textarea rows={2} className="mt-2" placeholder="Заметки" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-soft">
              <input type="checkbox" checked={form.remote} onChange={(e) => setForm({ ...form, remote: e.target.checked })} className="accent-iris" /> Remote
            </label>
            <label className="flex items-center gap-1.5 text-sm text-soft">
              <input type="checkbox" checked={form.hebrew_required} onChange={(e) => setForm({ ...form, hebrew_required: e.target.checked })} className="accent-iris" /> Нужен иврит
            </label>
            <Button onClick={add} disabled={!form.title.trim()} className="ml-auto">Добавить</Button>
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Поиск по роли, компании, источнику…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Chip active={fRemote} onClick={() => setFRemote((v) => !v)}>Remote</Chip>
        {items && <span className="ml-auto text-xs text-soft">{filtered.length} вакансий</span>}
      </div>

      {items === null ? (
        <Card><div className="h-40 animate-pulse rounded-xl bg-line/60" /></Card>
      ) : filtered.length === 0 ? (
        <Card><Empty title="Вакансий нет" hint="Добавьте вручную или запустите Career Search Agent — он найдёт и оценит вакансии." /></Card>
      ) : (
        <div className="-mx-2 flex snap-x gap-3 overflow-x-auto px-2 pb-3">
          {CAREER_STATUSES.map((status) => {
            const col = byStatus.get(status)!;
            const meta = STATUS_META[status];
            return (
              <div key={status} className="flex w-[272px] shrink-0 snap-start flex-col rounded-2xl border border-white/40 bg-white/25 p-2.5 backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2 px-1.5 pt-0.5">
                  <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                  <span className="text-sm font-semibold">{status}</span>
                  <span className="text-xs text-soft">{col.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {col.map((i) => (
                    <button
                      key={i.id}
                      onClick={() => setOpenId(i.id)}
                      className="group flex flex-col gap-2 rounded-xl border border-white/55 bg-white/55 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-white/70 hover:bg-white/70 hover:shadow-card"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-display text-sm font-semibold leading-snug">{i.title}</div>
                        {typeof i.fit_score === "number" && (
                          <span className={cn("shrink-0 text-sm font-bold tabular-nums", fitColor(i.fit_score))}>{i.fit_score}</span>
                        )}
                      </div>
                      <div className="text-xs text-soft">{[i.company, i.country, i.level].filter(Boolean).join(" · ") || "—"}</div>
                      <div className="flex flex-wrap items-center gap-1">
                        {i.remote && <Badge className="bg-sky-soft text-sky">Remote</Badge>}
                        {i.hebrew_required && <Badge className="bg-peach-soft text-peach"><Languages size={10} className="mr-0.5" />Иврит</Badge>}
                        {i.level_match && <Badge className={LEVEL_MATCH_META[i.level_match].cls}>{LEVEL_MATCH_META[i.level_match].label}</Badge>}
                      </div>
                    </button>
                  ))}
                  {col.length === 0 && <div className="rounded-xl border border-dashed border-white/50 py-5 text-center text-xs text-soft/60">пусто</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && <Drawer item={open} onClose={() => setOpenId(null)} onPatch={patch} onRemove={remove} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

const TABS = ["Overview", "Fit", "Документы", "Интервью", "Отказ"] as const;
type Tab = (typeof TABS)[number];

function Drawer({ item, onClose, onPatch, onRemove }: {
  item: Item;
  onClose: () => void;
  onPatch: (id: string, p: Partial<Item>) => void;
  onRemove: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [calib, setCalib] = useState<Calibration | null>(null);
  const [calibLoading, setCalibLoading] = useState(false);
  const [calibError, setCalibError] = useState<string | null>(null);

  async function calibrate() {
    setCalibLoading(true);
    setCalibError(null);
    setCalib(null);
    try {
      const r = await fetch("/api/career/calibrate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось");
      setCalib(d);
    } catch (e: any) {
      setCalibError(e.message);
    } finally {
      setCalibLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-strong relative ml-auto flex h-full w-full max-w-[1360px] flex-col overflow-hidden md:w-[58%] md:min-w-[680px]">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-line/70 p-4">
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-semibold leading-snug">{item.title}</div>
            <div className="truncate text-sm text-soft">{[item.company, item.country].filter(Boolean).join(" · ") || "—"}</div>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-full p-1.5 text-soft hover:bg-white/70"><X size={18} /></button>
        </div>

        {/* Status + actions */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line/70 px-4 py-3">
          <Select value={normalizeStatus(item.status)} onChange={(e) => onPatch(item.id, { status: e.target.value })} className="!py-1.5 text-xs">
            {CAREER_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
          {item.link && (
            <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-iris-soft px-3 py-1.5 text-xs font-semibold text-iris-deep hover:bg-[#dcd6f8]">
              <ExternalLink size={13} /> Открыть
            </a>
          )}
          {item.source && <span className="text-xs text-soft">{item.source}</span>}
          <button onClick={() => onRemove(item.id)} aria-label="Удалить" className="ml-auto rounded-full p-1.5 text-soft/50 hover:bg-rose-soft hover:text-rose"><Trash2 size={15} /></button>
        </div>

        {/* AI actions */}
        <div className="border-b border-line/70 px-4 py-2">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={calibrate} disabled={calibLoading}
              className="inline-flex items-center gap-1 rounded-full bg-iris-soft px-2.5 py-1 text-xs font-semibold text-iris-deep hover:bg-[#dcd6f8] disabled:opacity-50">
              <Compass size={11} /> {calibLoading ? "Калибрую…" : "Calibrate"}
            </button>
            <button onClick={() => setTab("Документы")}
              className="inline-flex items-center gap-1 rounded-full bg-iris-soft px-2.5 py-1 text-xs font-semibold text-iris-deep hover:bg-[#dcd6f8]">
              <Sparkles size={11} /> Документы
            </button>
            <button onClick={() => setTab("Интервью")}
              className="inline-flex items-center gap-1 rounded-full bg-iris-soft px-2.5 py-1 text-xs font-semibold text-iris-deep hover:bg-[#dcd6f8]">
              <Sparkles size={11} /> Prepare
            </button>
            <button disabled title="Скоро · Sprint 5"
              className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2.5 py-1 text-xs font-semibold text-soft/60">
              <Sparkles size={11} /> Score
            </button>
          </div>
          {calibError && <div className="mt-2 text-xs text-rose">{calibError}</div>}
          {calib && (
            <div className="mt-2 rounded-xl bg-white/70 p-3 text-sm">
              <div className="mb-2 flex items-center gap-2">
                <Badge className={VERDICT_META[calib.verdict].cls}>{VERDICT_META[calib.verdict].label}</Badge>
                <span className="text-xs text-soft">позиционирование под вакансию</span>
              </div>
              {calib.reads_as && <CalibRow label="Как прочитают" text={calib.reads_as} />}
              {calib.reframe && <CalibRow label="Переформулировка" text={calib.reframe} />}
              {calib.title_framing && <CalibRow label="Headline" text={calib.title_framing} />}
              {calib.risks && <CalibRow label="Риски" text={calib.risks} />}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-line/70 px-3 pt-2">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("rounded-t-lg px-2.5 py-1.5 text-xs font-semibold transition", tab === t ? "bg-white/70 text-ink" : "text-soft hover:text-ink")}>
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "Overview" && <OverviewTab item={item} onPatch={onPatch} />}
          {tab === "Fit" && <FitTab item={item} />}
          {tab === "Документы" && <DocsTab item={item} />}
          {tab === "Интервью" && <InterviewsTab item={item} />}
          {tab === "Отказ" && <RejectionTab item={item} onPatch={onPatch} />}
        </div>
      </div>
    </div>
  );
}

function CalibRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="mb-1.5 last:mb-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-soft">{label}: </span>
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-soft">{label}</div>
      {children}
    </div>
  );
}

function OverviewTab({ item, onPatch }: { item: Item; onPatch: (id: string, p: Partial<Item>) => void }) {
  const [local, setLocal] = useState(item);
  useEffect(() => setLocal(item), [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const blur = (p: Partial<Item>) => onPatch(item.id, p);

  // Сохраняем title только если не пустой (колонка NOT NULL).
  const saveTitle = () => { const t = (local.title ?? "").trim(); if (t && t !== item.title) blur({ title: t }); };

  return (
    <div className="flex flex-col gap-4">
      {/* Редактируемые данные вакансии */}
      <Field label="Роль">
        <Input value={local.title ?? ""} onChange={(e) => setLocal({ ...local, title: e.target.value })} onBlur={saveTitle} placeholder="Название роли" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Компания">
          <Input value={local.company ?? ""} onChange={(e) => setLocal({ ...local, company: e.target.value })} onBlur={() => blur({ company: local.company || null })} placeholder="Компания" />
        </Field>
        <Field label="Локация / страна">
          <Input value={local.country ?? ""} onChange={(e) => setLocal({ ...local, country: e.target.value })} onBlur={() => blur({ country: local.country || null })} placeholder="Израиль / remote" />
        </Field>
        <Field label="Уровень">
          <Input value={local.level ?? ""} onChange={(e) => setLocal({ ...local, level: e.target.value })} onBlur={() => blur({ level: local.level || null })} placeholder="mid / senior…" />
        </Field>
        <Field label="Язык">
          <Input value={local.language ?? ""} onChange={(e) => setLocal({ ...local, language: e.target.value })} onBlur={() => blur({ language: local.language || null })} placeholder="English…" />
        </Field>
      </div>
      <Field label="Ссылка на вакансию">
        <Input value={local.link ?? ""} onChange={(e) => setLocal({ ...local, link: e.target.value })} onBlur={() => blur({ link: local.link || null })} placeholder="https://…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Зарплата">
          <Input value={local.salary ?? ""} onChange={(e) => setLocal({ ...local, salary: e.target.value })} onBlur={() => blur({ salary: local.salary || null })} placeholder="если известна" />
        </Field>
        <Field label="Источник">{item.source ? <a href={item.link ?? "#"} className="text-sm text-iris-deep">{item.source}</a> : <span className="text-sm text-soft">из ссылки</span>}</Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-sm text-soft">
          <input type="checkbox" checked={!!local.remote} onChange={(e) => { setLocal({ ...local, remote: e.target.checked }); blur({ remote: e.target.checked }); }} className="accent-iris" /> Remote
        </label>
        <label className="flex items-center gap-1.5 text-sm text-soft">
          <input type="checkbox" checked={!!local.hebrew_required} onChange={(e) => { setLocal({ ...local, hebrew_required: e.target.checked }); blur({ hebrew_required: e.target.checked }); }} className="accent-iris" /> Нужен иврит
        </label>
      </div>

      <div className="border-t border-line/60 pt-1" />

      <Field label="Следующий шаг">
        <Textarea rows={2} value={local.next_action ?? ""} onChange={(e) => setLocal({ ...local, next_action: e.target.value })} onBlur={() => blur({ next_action: local.next_action })} placeholder="Что сделать дальше" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата отклика">
          <Input type="date" value={local.application_date ?? ""} onChange={(e) => { setLocal({ ...local, application_date: e.target.value }); blur({ application_date: e.target.value || null }); }} />
        </Field>
        <Field label="Дедлайн шага">
          <Input type="date" value={local.next_action_date ?? ""} onChange={(e) => { setLocal({ ...local, next_action_date: e.target.value }); blur({ next_action_date: e.target.value || null }); }} />
        </Field>
      </div>

      <div className="border-t border-line/60 pt-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-soft">Контакты</div>
        <div className="flex flex-col gap-2">
          <Input placeholder="Рекрутер" value={local.recruiter_name ?? ""} onChange={(e) => setLocal({ ...local, recruiter_name: e.target.value })} onBlur={() => blur({ recruiter_name: local.recruiter_name || null })} />
          <Input placeholder="Email рекрутера" value={local.recruiter_email ?? ""} onChange={(e) => setLocal({ ...local, recruiter_email: e.target.value })} onBlur={() => blur({ recruiter_email: local.recruiter_email || null })} />
          <Input placeholder="LinkedIn рекрутера" value={local.recruiter_linkedin ?? ""} onChange={(e) => setLocal({ ...local, recruiter_linkedin: e.target.value })} onBlur={() => blur({ recruiter_linkedin: local.recruiter_linkedin || null })} />
          <Input placeholder="Hiring manager" value={local.hiring_manager ?? ""} onChange={(e) => setLocal({ ...local, hiring_manager: e.target.value })} onBlur={() => blur({ hiring_manager: local.hiring_manager || null })} />
        </div>
      </div>

      <Field label="Заметки">
        <Textarea rows={4} value={local.notes ?? ""} onChange={(e) => setLocal({ ...local, notes: e.target.value })} onBlur={() => blur({ notes: local.notes })} placeholder="Заметки по вакансии" />
      </Field>

      <Field label="Категория">
        <Select value={item.bucket ?? ""} onChange={(e) => blur({ bucket: e.target.value })} className="w-full !py-2 text-sm">
          <option value="" disabled>—</option>
          {BUCKETS.map((b) => <option key={b}>{b}</option>)}
        </Select>
      </Field>
    </div>
  );
}

type Round = {
  id: string;
  round_type: string | null;
  scheduled_at: string | null;
  transcript: string | null;
  analysis: (InterviewAnalysis & { id: string }) | null;
};

function InterviewsTab({ item }: { item: Item }) {
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ round_type: ROUND_TYPES[0] as string, scheduled_at: "", transcript: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const [prepState, setPrepState] = useState<"idle" | "loading" | string>("idle");
  const [pattern, setPattern] = useState<DebriefPattern | null>(null);
  const [patternMsg, setPatternMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/career/interviews?career_item_id=${item.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRounds(Array.isArray(d) ? d : []))
      .catch(() => setRounds([]));
  }, [item.id]);

  async function addRound() {
    const r = await fetch("/api/career/interviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ career_item_id: item.id, ...nf, scheduled_at: nf.scheduled_at || null }),
    });
    if (r.ok) {
      const created = await r.json();
      setRounds((p) => [...(p ?? []), created]);
      setNf({ round_type: ROUND_TYPES[0], scheduled_at: "", transcript: "" });
      setAdding(false);
    }
  }
  async function patchRound(id: string, p: Partial<Round>) {
    setRounds((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, ...p } : r)));
    await fetch("/api/career/interviews", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) });
  }
  async function delRound(id: string) {
    setRounds((prev) => (prev ?? []).filter((r) => r.id !== id));
    await fetch("/api/career/interviews", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }
  async function analyze(id: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/career/interviews/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interview_id: id }) });
      const d = await r.json();
      if (r.ok) setRounds((prev) => (prev ?? []).map((x) => (x.id === id ? { ...x, analysis: d } : x)));
      else alert(d.error || "Не удалось разобрать");
    } finally { setBusy(null); }
  }
  async function prepare() {
    setPrepState("loading"); setPrep(null);
    try {
      const r = await fetch("/api/career/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось");
      setPrep(d); setPrepState("idle");
    } catch (e: any) { setPrepState(e.message); }
  }
  async function loadPattern() {
    setPatternMsg("Считаю…"); setPattern(null);
    const r = await fetch(`/api/career/debrief?career_item_id=${item.id}`);
    const d = await r.json();
    if (!r.ok) setPatternMsg(d.error || "Ошибка");
    else if (!d.pattern) setPatternMsg(`Нужно минимум 2 разбора (сейчас ${d.count}).`);
    else { setPattern(d.pattern); setPatternMsg(null); }
  }

  if (!rounds) return <div className="h-20 animate-pulse rounded-xl bg-line/60" />;

  return (
    <div className="flex flex-col gap-4">
      {/* Prepare */}
      <div className="rounded-xl border border-line/70 p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Подготовка к интервью</span>
          <Button variant="soft" className="ml-auto !py-1 text-xs" onClick={prepare} disabled={prepState === "loading"}>
            {prepState === "loading" ? "Готовлю…" : "Сгенерировать"}
          </Button>
        </div>
        {typeof prepState === "string" && prepState !== "idle" && prepState !== "loading" && <div className="mt-1 text-xs text-rose">{prepState}</div>}
        {prep && (
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <ListBlock label="Вероятные вопросы" items={prep.likely_questions} />
            <ListBlock label="Твои истории под них" items={prep.story_points} />
            {prep.positioning && <CalibRow label="Позиционирование" text={prep.positioning} />}
            <ListBlock label="Спросить интервьюера" items={prep.questions_to_ask} />
          </div>
        )}
      </div>

      {/* Pattern (debrief через несколько раундов) */}
      <div className="rounded-xl border border-line/70 p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Паттерн по раундам</span>
          <Button variant="ghost" className="ml-auto !py-1 text-xs" onClick={loadPattern}>Обновить</Button>
        </div>
        {patternMsg && <div className="mt-1 text-xs text-soft">{patternMsg}</div>}
        {pattern && (
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <CalibRow label="Паттерн" text={pattern.pattern} />
            <ListBlock label="Повторяющиеся провалы" items={pattern.recurring_weak_spots} />
            <ListBlock label="Повторяющиеся сильные" items={pattern.recurring_strengths} />
            {pattern.fix_focus && <CalibRow label="Фокус" text={pattern.fix_focus} />}
          </div>
        )}
      </div>

      {/* Rounds */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Раунды ({rounds.length})</span>
        <Button variant="soft" className="!py-1 text-xs" onClick={() => setAdding((v) => !v)}>{adding ? "Отмена" : "+ Раунд"}</Button>
      </div>

      {adding && (
        <div className="flex flex-col gap-2 rounded-xl border border-line/70 p-3">
          <div className="flex gap-2">
            <Select value={nf.round_type} onChange={(e) => setNf({ ...nf, round_type: e.target.value })} className="!py-1.5 text-xs">
              {ROUND_TYPES.map((t) => <option key={t} value={t}>{ROUND_LABEL[t]}</option>)}
            </Select>
            <Input type="date" value={nf.scheduled_at} onChange={(e) => setNf({ ...nf, scheduled_at: e.target.value })} className="!py-1.5 text-xs" />
          </div>
          <Textarea rows={4} placeholder="Транскрипт раунда (вставь вручную)" value={nf.transcript} onChange={(e) => setNf({ ...nf, transcript: e.target.value })} />
          <Button className="self-end !py-1 text-xs" onClick={addRound}>Добавить раунд</Button>
        </div>
      )}

      {rounds.length === 0 && !adding && <Empty title="Раундов нет" hint="Добавь раунд и вставь транскрипт — система разберёт его." />}

      {rounds.map((r) => (
        <RoundCard key={r.id} round={r} busy={busy === r.id}
          onTranscript={(t) => patchRound(r.id, { transcript: t })}
          onAnalyze={() => analyze(r.id)} onDelete={() => delRound(r.id)} />
      ))}
    </div>
  );
}

function RoundCard({ round, busy, onTranscript, onAnalyze, onDelete }: {
  round: Round; busy: boolean; onTranscript: (t: string) => void; onAnalyze: () => void; onDelete: () => void;
}) {
  const [t, setT] = useState(round.transcript ?? "");
  const a = round.analysis;
  return (
    <div className="rounded-xl border border-line/70 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge className="bg-iris-soft text-iris-deep">{ROUND_LABEL[round.round_type ?? "other"] ?? round.round_type}</Badge>
        {round.scheduled_at && <span className="text-xs text-soft">{round.scheduled_at.slice(0, 10)}</span>}
        <button onClick={onDelete} aria-label="Удалить раунд" className="ml-auto rounded-full p-1 text-soft/50 hover:bg-rose-soft hover:text-rose"><Trash2 size={13} /></button>
      </div>
      <Textarea rows={4} value={t} onChange={(e) => setT(e.target.value)} onBlur={() => t !== round.transcript && onTranscript(t)} placeholder="Транскрипт раунда" />
      <div className="mt-2 flex items-center gap-2">
        <Button variant="soft" className="!py-1 text-xs" onClick={onAnalyze} disabled={busy || t.trim().length < 50}>
          {busy ? "Разбираю…" : a ? "Разобрать заново" : "Разобрать"}
        </Button>
        {t.trim().length < 50 && <span className="text-xs text-soft">нужен транскрипт</span>}
      </div>

      {a && (
        <div className="mt-3 flex flex-col gap-3 border-t border-line/60 pt-3 text-sm">
          {a.dimension_scores && Object.keys(a.dimension_scores).length > 0 && (
            <div className="flex flex-col gap-1">
              {DIMENSION_AXES.filter((ax) => ax in a.dimension_scores).map((ax) => {
                const v = a.dimension_scores[ax];
                return (
                  <div key={ax} className="flex items-center gap-2">
                    <span className="w-36 shrink-0 text-xs text-soft">{ax}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                      <div className={cn("h-full rounded-full", v >= 7 ? "bg-sage" : v >= 4 ? "bg-butter" : "bg-rose")} style={{ width: `${v * 10}%` }} />
                    </div>
                    <span className="w-5 text-right text-xs font-semibold tabular-nums">{v}</span>
                  </div>
                );
              })}
            </div>
          )}
          {a.strengths && <CalibRow label="Сильно" text={a.strengths} />}
          {a.weaknesses && <CalibRow label="Слабо" text={a.weaknesses} />}
          {a.missed_opportunities && <CalibRow label="Упущено" text={a.missed_opportunities} />}
          {a.objections && <CalibRow label="Возражения" text={a.objections} />}
          {a.recommendations && <CalibRow label="К следующему разу" text={a.recommendations} />}
          {(a as any).drive_link && (
            <a href={(a as any).drive_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-iris-deep hover:underline">
              <ExternalLink size={12} /> Разбор в Second Brain
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-soft">{label}</div>
      <ul className="mt-0.5 list-disc pl-4">
        {items.map((x, i) => <li key={i} className="leading-relaxed">{x}</li>)}
      </ul>
    </div>
  );
}

function RejectionTab({ item, onPatch }: { item: Item; onPatch: (id: string, p: Partial<Item>) => void }) {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<RejectionClassification | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/career/rejection?career_item_id=${item.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setRaw(d.raw_text ?? ""); setResult(d.classified_reasons ?? null); } })
      .catch(() => {});
  }, [item.id]);

  async function classify() {
    if (raw.trim().length < 5) return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/career/rejection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, raw_text: raw }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось");
      setResult(d.classified_reasons ?? null);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea rows={5} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Вставь текст отказа или контекст (письмо рекрутера, причина)…" />
      <div className="flex items-center gap-2">
        {normalizeStatus(item.status) !== "Отказ" && (
          <Button variant="ghost" className="!py-1 text-xs" onClick={() => onPatch(item.id, { status: "Отказ" })}>Отметить как Отказ</Button>
        )}
        {err && <span className="text-xs text-rose">{err}</span>}
        <Button variant="soft" className="ml-auto !py-1 text-xs" onClick={classify} disabled={loading || raw.trim().length < 5}>
          {loading ? "Анализирую…" : "Классифицировать"}
        </Button>
      </div>

      {result && (
        <div className="flex flex-col gap-3">
          {result.summary && <div className="rounded-lg bg-white/70 p-2.5 text-sm font-medium">{result.summary}</div>}
          <div className="flex flex-col gap-2">
            {result.reasons.map((r, i) => (
              <div key={i} className="rounded-xl border border-line/70 p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{i + 1}. {r.reason}</span>
                  <Badge className={cn("ml-auto", LIKELIHOOD_META[r.likelihood])}>{r.likelihood}</Badge>
                </div>
                {r.note && <div className="mt-1 text-soft">{r.note}</div>}
              </div>
            ))}
          </div>
          {result.positioning_verdict && (
            <div className="rounded-xl bg-iris-soft/60 p-3 text-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-iris-deep">Позиционный вывод</div>
              <div className="mt-1 leading-relaxed">{result.positioning_verdict}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocsTab({ item }: { item: Item }) {
  const [loading, setLoading] = useState<"cover" | "recruiter" | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function gen(k: "cover" | "recruiter") {
    setLoading(k);
    setText("");
    setErr(null);
    setCopied(false);
    try {
      const r = await fetch("/api/career/document", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, kind: k }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось");
      setText(d.text);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button variant="soft" className="flex-1" onClick={() => gen("recruiter")} disabled={loading !== null}>
          {loading === "recruiter" ? "Пишу…" : "Сообщение рекрутеру"}
        </Button>
        <Button variant="soft" className="flex-1" onClick={() => gen("cover")} disabled={loading !== null}>
          {loading === "cover" ? "Пишу…" : "Cover letter"}
        </Button>
      </div>
      <p className="text-xs text-soft">Текст генерируется для ручной отправки — ничего не отправляется автоматически.</p>
      {err && <div className="text-sm text-rose">{err}</div>}
      {text && (
        <div>
          <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="ghost" className="mt-2" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
            {copied ? "Скопировано" : "Копировать"}
          </Button>
        </div>
      )}
    </div>
  );
}

function FitTab({ item }: { item: Item }) {
  if (typeof item.fit_score !== "number") {
    return <Empty title="Оценки ещё нет" hint="Fit Score проставляет Career Search Agent при наличии профиля (cv_text). Скоринг по кнопке Score — Sprint 2." />;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className={cn("font-display text-4xl font-bold tabular-nums", fitColor(item.fit_score))}>{item.fit_score}</span>
        <span className="text-sm text-soft">/ 10 fit score</span>
        {item.level_match && <Badge className={cn("ml-auto", LEVEL_MATCH_META[item.level_match].cls)}>{LEVEL_MATCH_META[item.level_match].label}</Badge>}
      </div>
      {item.fit_reason && <Field label="Почему подходит"><p className="text-sm leading-relaxed">{item.fit_reason}</p></Field>}
      {item.fit_risks && <Field label="Риски"><p className="text-sm leading-relaxed">{item.fit_risks}</p></Field>}
      {item.to_strengthen && <Field label="Что усилить"><p className="text-sm leading-relaxed">{item.to_strengthen}</p></Field>}
    </div>
  );
}
