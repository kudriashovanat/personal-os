"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, Button, Textarea } from "@/components/ui";
import { todayISO, cn } from "@/lib/utils";
import { Flame, Check } from "lucide-react";

type Entry = {
  id?: string; entry_date: string;
  grateful_for: string | null; grateful_to: string | null; best_moment: string | null;
  went_well: string | null; went_wrong: string | null; learned: string | null; improve: string | null;
  mood: number | null;
};

const MOODS = ["😞", "😕", "😐", "🙂", "😄"];
const EMPTY: Entry = {
  entry_date: todayISO(), grateful_for: "", grateful_to: "", best_moment: "",
  went_well: "", went_wrong: "", learned: "", improve: "", mood: null,
};

export default function GratitudePage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [form, setForm] = useState<Entry>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/gratitude")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Entry[]) => {
        setEntries(list);
        const today = list.find((e) => e.entry_date === todayISO());
        if (today) setForm({ ...EMPTY, ...today });
      })
      .catch(() => setEntries([]));
  }, []);

  async function save() {
    setSaving(true);
    const r = await fetch("/api/gratitude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (r.ok) {
      const e = await r.json();
      setEntries((prev) => {
        const rest = (prev ?? []).filter((x) => x.entry_date !== e.entry_date);
        return [e, ...rest];
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  const streak = useMemo(() => {
    if (!entries) return 0;
    const dates = new Set(entries.map((e) => e.entry_date));
    let s = 0;
    const d = new Date();
    if (!dates.has(todayISO())) d.setDate(d.getDate() - 1); // streak не рвётся, пока день не закончился
    for (;;) {
      const key = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      if (!dates.has(key)) break;
      s++;
      d.setDate(d.getDate() - 1);
    }
    return s;
  }, [entries]);

  // Календарь текущего месяца
  const month = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // понедельник — первый
    const map = new Map((entries ?? []).map((e) => [e.entry_date, e.mood]));
    return { daysInMonth, offset, map, now };
  }, [entries]);

  const field = (label: string, key: keyof Entry, placeholder: string) => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-soft">{label}</label>
      <Textarea
        rows={2}
        placeholder={placeholder}
        value={(form[key] as string) ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <SectionTitle eyebrow="Вечерний ритуал" title="Благодарность и рефлексия" />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <h2 className="mb-3 font-display text-lg font-semibold">Благодарность</h2>
            <div className="space-y-3">
              {field("За что я благодарна сегодня", "grateful_for", "Три вещи, большие или совсем маленькие…")}
              {field("Кому благодарна", "grateful_to", "Человек, который сделал день лучше…")}
              {field("Лучший момент дня", "best_moment", "Момент, который хочется запомнить…")}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-display text-lg font-semibold">Вечерняя рефлексия</h2>
            <div className="space-y-3">
              {field("Что получилось", "went_well", "")}
              {field("Что не получилось", "went_wrong", "")}
              {field("Чему научилась", "learned", "")}
              {field("Что улучшить завтра", "improve", "")}
            </div>
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-soft">Настроение дня</label>
              <div className="flex gap-2">
                {MOODS.map((m, i) => (
                  <button
                    key={i}
                    aria-label={`Настроение ${i + 1} из 5`}
                    onClick={() => setForm({ ...form, mood: i + 1 })}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full text-xl transition",
                      form.mood === i + 1 ? "bg-iris-soft ring-2 ring-iris scale-110" : "bg-white/70 hover:bg-white"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={save} disabled={saving} className="mt-5 w-full">
              {saved ? <><Check size={15} /> Сохранено</> : saving ? "Сохраняю…" : "Сохранить день"}
            </Button>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card className="bg-gradient-to-br from-peach-soft/70 to-rose-soft/40 text-center">
            <Flame size={26} className="mx-auto text-peach" />
            <div className="mt-1 font-display text-4xl font-semibold">{streak}</div>
            <div className="text-sm text-soft">{streak === 1 ? "день подряд" : streak >= 2 && streak <= 4 ? "дня подряд" : "дней подряд"}</div>
          </Card>

          <Card>
            <h3 className="mb-3 font-display text-base font-semibold capitalize">
              {month.now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
            </h3>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-soft">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: month.offset }).map((_, i) => <div key={`o${i}`} />)}
              {Array.from({ length: month.daysInMonth }).map((_, i) => {
                const day = i + 1;
                const key = `${month.now.getFullYear()}-${String(month.now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const has = month.map.has(key);
                const mood = month.map.get(key);
                const isToday = key === todayISO();
                return (
                  <div
                    key={day}
                    title={has && mood ? `Настроение: ${MOODS[mood - 1]}` : undefined}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg text-xs",
                      has ? "bg-sage-soft font-semibold text-sage" : "bg-white/50 text-soft/60",
                      isToday && "ring-2 ring-iris"
                    )}
                  >
                    {has && mood ? MOODS[mood - 1] : day}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
