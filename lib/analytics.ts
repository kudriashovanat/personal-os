// lib/analytics.ts — слой аналитики поиска работы (чистые функции, без БД/React).
// Считается из career_items + career_status_history. Принцип: на малых данных
// показываем activity-метрики (управляют поведением), конверсии гейтим по N.

import { CAREER_STATUSES, normalizeStatus, type CareerStatus } from "@/lib/career";

export type ItemRow = {
  id: string;
  title?: string | null;
  company?: string | null;
  status: string;
  level_match?: string | null;
  fit_score?: number | null;
  country?: string | null;
  source?: string | null;
  created_at?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
};

export type HistoryRow = {
  career_item_id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
};

export const APPLIED: CareerStatus = "Откликнулась";
// Стадии ожидания ответа — кандидаты на «остывание» / follow-up.
export const WAITING_STAGES: CareerStatus[] = ["Откликнулась", "Скрининг", "Интервью", "Финал"];

const DAY = 86_400_000;
const stageIdx = (s: CareerStatus) => CAREER_STATUSES.indexOf(s);
const APPLIED_IDX = stageIdx(APPLIED);

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
function daysBetween(aIso: string, nowMs: number): number {
  return Math.floor((nowMs - new Date(aIso).getTime()) / DAY);
}

export type ColdApp = {
  id: string;
  title: string;
  company: string | null;
  status: CareerStatus;
  agingDays: number;
};

export type ActionDue = {
  id: string;
  title: string;
  company: string | null;
  action: string;
  date: string;
  overdue: boolean;
};

export type Analytics = {
  totals: { found: number; applied: number; active: number };
  appsPerDay: { today: number; last7Avg: number; target: number; series: { date: string; count: number }[] };
  pipeline: { status: CareerStatus; count: number }[];
  positioning: { at: number; below: number; above: number; unknown: number; overLevelingPct: number | null };
  fit: { appliedAvg: number | null; allAvg: number | null; disciplinePct: number | null };
  cold: ColdApp[];
  actionsDue: ActionDue[];
  confidence: { applied: number; responded: number; enoughForConversion: boolean };
};

export type AnalyticsOpts = { now?: number; target?: number; coldDays?: number; conversionMinN?: number };

export function computeAnalytics(items: ItemRow[], history: HistoryRow[], opts: AnalyticsOpts = {}): Analytics {
  const now = opts.now ?? Date.now();
  const target = opts.target ?? 10;
  const coldDays = opts.coldDays ?? 7;
  const conversionMinN = opts.conversionMinN ?? 15;

  // История по вакансии.
  const histByItem = new Map<string, HistoryRow[]>();
  for (const h of history) {
    const arr = histByItem.get(h.career_item_id) ?? [];
    arr.push(h);
    histByItem.set(h.career_item_id, arr);
  }

  // Максимально достигнутая стадия по вакансии (по истории, иначе по текущему статусу).
  function maxStageIdx(item: ItemRow): number {
    const hs = histByItem.get(item.id) ?? [];
    let mx = stageIdx(normalizeStatus(item.status));
    for (const h of hs) mx = Math.max(mx, stageIdx(normalizeStatus(h.to_status)));
    return mx;
  }
  // Последнее изменение по вакансии (для «остывания»).
  function lastChange(item: ItemRow): number {
    const hs = histByItem.get(item.id) ?? [];
    let last = item.created_at ? new Date(item.created_at).getTime() : 0;
    for (const h of hs) last = Math.max(last, new Date(h.changed_at).getTime());
    return last;
  }

  const found = items.length;
  const appliedItems = items.filter((it) => maxStageIdx(it) >= APPLIED_IDX);
  const applied = appliedItems.length;

  // --- Отклики по дням (переходы в «Откликнулась») ---
  const perDay = new Map<string, number>();
  for (const h of history) {
    if (normalizeStatus(h.to_status) === APPLIED) {
      const k = dayKey(h.changed_at);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
  }
  const series: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const k = new Date(now - i * DAY).toISOString().slice(0, 10);
    series.push({ date: k, count: perDay.get(k) ?? 0 });
  }
  const todayKey = new Date(now).toISOString().slice(0, 10);
  const last7 = series.slice(-7).reduce((s, d) => s + d.count, 0);

  // --- Пайплайн по стадиям ---
  const counts = new Map<CareerStatus, number>();
  for (const s of CAREER_STATUSES) counts.set(s, 0);
  for (const it of items) {
    const s = normalizeStatus(it.status);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const pipeline = CAREER_STATUSES.map((s) => ({ status: s, count: counts.get(s) ?? 0 }));
  const active = items.filter((it) => WAITING_STAGES.includes(normalizeStatus(it.status))).length;

  // --- Позиционная смесь (монитор over-leveling) среди откликнутых ---
  const pos = { at: 0, below: 0, above: 0, unknown: 0 };
  for (const it of appliedItems) {
    const lm = it.level_match;
    if (lm === "at") pos.at++;
    else if (lm === "below") pos.below++;
    else if (lm === "above") pos.above++;
    else pos.unknown++;
  }
  const lmKnown = pos.at + pos.below + pos.above;
  const overLevelingPct = lmKnown ? Math.round((pos.above / lmKnown) * 100) : null;

  // --- Fit-дисциплина ---
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
  const appliedScores = appliedItems.map((i) => i.fit_score).filter((x): x is number => typeof x === "number");
  const allScores = items.map((i) => i.fit_score).filter((x): x is number => typeof x === "number");
  const disciplinePct = appliedScores.length
    ? Math.round((appliedScores.filter((x) => x >= 7).length / appliedScores.length) * 100)
    : null;

  // --- Остывшие заявки (follow-up) ---
  const cold: ColdApp[] = items
    .filter((it) => WAITING_STAGES.includes(normalizeStatus(it.status)))
    .map((it) => ({
      id: it.id,
      title: it.title ?? "Без названия",
      company: it.company ?? null,
      status: normalizeStatus(it.status),
      agingDays: daysBetween(new Date(lastChange(it)).toISOString(), now),
    }))
    .filter((c) => c.agingDays >= coldDays)
    .sort((a, b) => b.agingDays - a.agingDays);

  // --- Дайджест «сделать»: next_action с датой на сегодня/просрочено ---
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const actionsDue: ActionDue[] = items
    .filter((it) => it.next_action_date && it.next_action_date.slice(0, 10) <= todayStr && !["Отказ", "Архив"].includes(normalizeStatus(it.status)))
    .map((it) => ({
      id: it.id,
      title: it.title ?? "Без названия",
      company: it.company ?? null,
      action: it.next_action ?? "",
      date: it.next_action_date!.slice(0, 10),
      overdue: it.next_action_date!.slice(0, 10) < todayStr,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Достаточность данных для конверсий ---
  const respondedItems = items.filter((it) => maxStageIdx(it) > APPLIED_IDX).length; // прошли дальше отклика

  return {
    totals: { found, applied, active },
    appsPerDay: { today: perDay.get(todayKey) ?? 0, last7Avg: Math.round((last7 / 7) * 10) / 10, target, series },
    pipeline,
    positioning: { ...pos, overLevelingPct },
    fit: { appliedAvg: avg(appliedScores), allAvg: avg(allScores), disciplinePct },
    cold,
    actionsDue,
    confidence: { applied, responded: respondedItems, enoughForConversion: applied >= conversionMinN },
  };
}
