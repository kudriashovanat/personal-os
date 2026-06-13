"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, SectionTitle, Button, Input, Select, Textarea, Badge, Chip, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CAREER_STATUSES, normalizeStatus, DEFAULT_NEW_STATUS, type CareerStatus } from "@/lib/career";
import type { Calibration } from "@/lib/agents";
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
              <div key={status} className="w-[270px] shrink-0 snap-start">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                  <span className="text-sm font-semibold">{status}</span>
                  <span className="text-xs text-soft">{col.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {col.map((i) => (
                    <button
                      key={i.id}
                      onClick={() => setOpenId(i.id)}
                      className="glass group flex flex-col gap-2 p-3 text-left transition hover:shadow-lift"
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
                  {col.length === 0 && <div className="rounded-xl border border-dashed border-line py-4 text-center text-xs text-soft/60">пусто</div>}
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
      <div className="glass-strong relative ml-auto flex h-full w-full max-w-md flex-col overflow-hidden">
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
            {[["Score", "Sprint 2"], ["Cover Letter", "Sprint 2"], ["Prepare", "Sprint 3"]].map(([label, when]) => (
              <button key={label} disabled title={`Скоро · ${when}`}
                className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2.5 py-1 text-xs font-semibold text-soft/60">
                <Sparkles size={11} /> {label}
              </button>
            ))}
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
          {tab === "Документы" && <Empty title="Документы" hint="Cover letter, сообщение рекрутеру и CV-версии появятся здесь (Sprint 2)." />}
          {tab === "Интервью" && <Empty title="Интервью" hint="Раунды интервью и разбор транскриптов — Sprint 3. Транскрипт вставляется вручную." />}
          {tab === "Отказ" && <Empty title="Отказ" hint="Захват и классификация причины отказа — Sprint 4." />}
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Источник">{item.source ? <a href={item.link ?? "#"} className="text-sm text-iris-deep">{item.source}</a> : <span className="text-sm text-soft">—</span>}</Field>
        <Field label="Зарплата"><span className="text-sm">{item.salary || "—"}</span></Field>
      </div>

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
