// lib/career.ts — карьерный домен: канон статусов (в КОДЕ, не в БД) и хелперы.
// Используется агентом скоринга и страницей /career (Kanban).
// Принцип: status в БД оставлен свободным/широким CHECK, истина по набору — здесь.

/** Канонические Kanban-статусы (порядок = порядок колонок). */
export const CAREER_STATUSES = [
  "Новые",
  "Шортлист",
  "Откликнулась",
  "Скрининг",
  "Интервью",
  "Финал",
  "Оффер",
  "Отказ",
  "Архив",
] as const;

export type CareerStatus = (typeof CAREER_STATUSES)[number];

/** Легаси-значения (старые строки) → канон НА ЧТЕНИИ. Данные в БД не меняем. */
const LEGACY_STATUS: Record<string, CareerStatus> = {
  "посмотреть": "Новые",
  "откликнуться": "Шортлист",   // намерение откликнуться
  "откликнулась": "Откликнулась",
  "пропустить": "Архив",
};

/** Приводит любое значение статуса к канону (для отрисовки Kanban). */
export function normalizeStatus(s: string | null | undefined): CareerStatus {
  if (!s) return "Новые";
  if ((CAREER_STATUSES as readonly string[]).includes(s)) return s as CareerStatus;
  return LEGACY_STATUS[s] ?? "Новые";
}

/** Статус, которым агент пишет новые вакансии. */
export const DEFAULT_NEW_STATUS: CareerStatus = "Новые";

// ---------- Целевой профиль ролей (узкое место №1: over-leveling) ----------
// Скоринг сравнивает вакансию с ЭТИМ диапазоном, НЕ с прошлым титулом «HR Director».

export const TARGET_ROLES = [
  "HR Business Partner (HRBP)",
  "People Partner",
  "HR Manager",
  "Talent Acquisition Partner",
  "HR Generalist",
];

export const TARGET_LEVEL =
  "mid–senior IC / People Partner / HR Manager на израильском рынке. " +
  "НЕ Director/VP — прошлый титул «HR Director» используется только как опыт, не как целевой уровень.";

export type LevelMatch = "below" | "at" | "above";

/** 8 осей оценки интервью (канон — в коде, общий для агента и UI). */
export const DIMENSION_AXES = [
  "Коммуникация", "HR-экспертиза", "Бизнес-партнёрство", "Стратегическое мышление",
  "Аналитика и метрики", "Культурное соответствие", "Лидерство", "Позиционирование уровня",
] as const;

/** Канонические типы раундов интервью. */
export const ROUND_TYPES = ["recruiter", "manager", "ceo", "hrd", "final", "other"] as const;
export const ROUND_LABEL: Record<string, string> = {
  recruiter: "Рекрутер", manager: "Менеджер", ceo: "CEO", hrd: "HRD", final: "Финал", other: "Другое",
};

// ---------- Хелперы ----------

/** Домен из ссылки (source). null, если ссылка пустая/битая. */
export function domainOf(link?: string | null): string | null {
  if (!link) return null;
  try {
    const u = new URL(link.trim());
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    // запасной разбор без протокола
    const m = String(link).match(/^(?:https?:\/\/)?(?:www\.)?([^/\s]+)/i);
    return m ? m[1] : null;
  }
}

/** true, если строка зарплаты содержит реальные цифры (иначе salary → null). */
export function hasSalaryDigits(s?: string | null): boolean {
  return Boolean(s && /\d/.test(s));
}
