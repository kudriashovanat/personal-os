// lib/learning.ts — домен Learning OS: канон языков и интервальное повторение (SRS).
// Чистые функции, без БД/React — переиспользуются сервером и UI, тестируемы.

export const LANGS = ["en", "he"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_LABEL: Record<Lang, string> = { en: "English", he: "עברית · Иврит" };

export type LearningStatus = "new" | "learning" | "known";

/** Статус карточки выводится из box и числа повторов. */
export function statusOf(box: number, reviews: number): LearningStatus {
  if (reviews === 0) return "new";
  if (box >= 5) return "known";
  return "learning";
}

// Leitner: интервалы по «коробкам» (в днях). box после ответа → интервал[box-1].
const INTERVALS = [1, 2, 4, 9, 21, 45]; // box 1..6
const MAX_BOX = INTERVALS.length;       // 6

export type Grade = "good" | "again";

export type ReviewUpdate = {
  box: number;
  due_date: string; // YYYY-MM-DD
  reviewsInc: 1;
  lapsesInc: 0 | 1;
};

function addDays(fromISO: string, days: number): string {
  const d = new Date(fromISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Следующий повтор по Leitner.
 * good → box+1 (до MAX), срок = today + интервал[box].
 * again → сброс в box 0, показать снова сегодня (lapse).
 */
export function computeNextReview(box: number, grade: Grade, todayISO: string): ReviewUpdate {
  if (grade === "again") {
    return { box: 0, due_date: todayISO, reviewsInc: 1, lapsesInc: 1 };
  }
  const nb = Math.min(box + 1, MAX_BOX);
  const interval = INTERVALS[nb - 1] ?? INTERVALS[INTERVALS.length - 1];
  return { box: nb, due_date: addDays(todayISO, interval), reviewsInc: 1, lapsesInc: 0 };
}
