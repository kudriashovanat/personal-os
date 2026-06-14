import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CATEGORIES = ["Главное", "Работа", "Поиск работы", "Контент", "Личное"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_STYLE: Record<Category, { chip: string; dot: string }> = {
  "Главное": { chip: "bg-iris-soft text-iris-deep", dot: "bg-iris" },
  "Работа": { chip: "bg-sky-soft text-sky", dot: "bg-sky" },
  "Поиск работы": { chip: "bg-sage-soft text-sage", dot: "bg-sage" },
  "Контент": { chip: "bg-peach-soft text-peach", dot: "bg-peach" },
  "Личное": { chip: "bg-rose-soft text-rose", dot: "bg-rose" },
};

export function todayISO() {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

export function ruDate(d: Date = new Date()) {
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
}

export function greeting(name?: string | null) {
  const h = new Date().getHours();
  const part = h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
  const first = name && name.trim() ? name.trim().split(" ")[0] : "Наташа";
  return `${part}, ${first}`;
}

// Простое обнаружение даты/времени в тексте быстрой заметки (для предложения добавить в календарь)
export function detectDateTime(text: string): boolean {
  const patterns = [
    /\b\d{1,2}[:.]\d{2}\b/, // 14:30
    /\b\d{1,2}[./]\d{1,2}([./]\d{2,4})?\b/, // 12.06, 12.06.2026
    /\b(сегодня|завтра|послезавтра|понедельник|вторник|сред[ауы]|четверг|пятниц[ауы]|суббот[ауы]|воскресенье)\b/i,
    /\b(в|к)\s+\d{1,2}(\s|:|$)/i,
  ];
  return patterns.some((p) => p.test(text));
}
