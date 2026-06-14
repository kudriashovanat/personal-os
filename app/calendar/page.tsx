"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, Chip, Empty, Button, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MapPin, ExternalLink, Plus, CalendarPlus, ListPlus, Clock } from "lucide-react";

const todayISO = () => new Date().toISOString().slice(0, 10);
// Слоты времени с шагом 15 минут (00:00 … 23:45)
const TIMES = Array.from({ length: 24 * 4 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

type CalEvent = { id: string; title: string; start: string; end: string; allDay: boolean; location: string | null; link: string | null };

const PASTELS = ["bg-iris-soft text-iris-deep", "bg-sky-soft text-sky", "bg-sage-soft text-sage", "bg-peach-soft text-peach", "bg-rose-soft text-rose"];

export default function CalendarPage() {
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [view, setView] = useState<"day" | "week">("day");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | "meeting" | "task">(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mForm, setMForm] = useState({ title: "", date: todayISO(), start: "10:00", end: "11:00", location: "" });
  const [tForm, setTForm] = useState({ title: "", date: todayISO() });

  const load = useCallback(() => {
    fetch("/api/calendar/events?days=7")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setEvents(d);
      })
      .catch((e) => { setError(e.message); setEvents([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addMeeting() {
    if (!mForm.title.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const start = new Date(`${mForm.date}T${mForm.start}:00`).toISOString();
      const end = new Date(`${mForm.date}T${mForm.end}:00`).toISOString();
      const r = await fetch("/api/calendar/events", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: mForm.title, start, end, allDay: false, location: mForm.location || null }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось");
      setMsg("Встреча добавлена в Google Calendar ✓");
      setMForm({ ...mForm, title: "", location: "" }); setAdding(null); load();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function addTask() {
    if (!tForm.title.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: tForm.title.trim(), due_date: tForm.date }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось");
      setMsg("Задача добавлена в Планер ✓");
      setTForm({ ...tForm, title: "" }); setAdding(null);
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  const todayKey = new Date().toDateString();
  const dayEvents = useMemo(() => (events ?? []).filter((e) => new Date(e.start).toDateString() === todayKey), [events, todayKey]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events ?? []) {
      const k = new Date(e.start).toDateString();
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return map;
  }, [events]);

  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-4xl">
      <SectionTitle
        eyebrow="Google Calendar"
        title="Календарь"
        action={
          <div className="flex items-center gap-1.5">
            <Chip active={view === "day"} onClick={() => setView("day")}>День</Chip>
            <Chip active={view === "week"} onClick={() => setView("week")}>Неделя</Chip>
            <Button variant="primary" className="ml-1 !py-1.5" onClick={() => setAdding((a) => (a ? null : "meeting"))}><Plus size={15} /> Добавить</Button>
          </div>
        }
      />

      {adding && (
        <Card className="mb-4">
          <div className="mb-3 flex gap-1.5">
            <Chip active={adding === "meeting"} onClick={() => setAdding("meeting")}><CalendarPlus size={12} className="mr-1 inline" />Встреча</Chip>
            <Chip active={adding === "task"} onClick={() => setAdding("task")}><ListPlus size={12} className="mr-1 inline" />Задача</Chip>
          </div>
          {adding === "meeting" ? (
            <div className="flex flex-col gap-2">
              <Input placeholder="Название встречи" value={mForm.title} onChange={(e) => setMForm({ ...mForm, title: e.target.value })} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input type="date" value={mForm.date} onChange={(e) => setMForm({ ...mForm, date: e.target.value })} />
                <div className="flex items-center gap-1.5 rounded-xl border border-line bg-white/80 px-2.5">
                  <Clock size={14} className="shrink-0 text-soft" />
                  <Select aria-label="Начало" value={mForm.start} className="!border-0 !bg-transparent !px-1 !py-2.5 !ring-0 focus:!ring-0"
                    onChange={(e) => {
                      const start = e.target.value;
                      const idx = TIMES.indexOf(start);
                      const end = idx >= 0 && TIMES[idx + 4] ? TIMES[idx + 4] : mForm.end;
                      setMForm({ ...mForm, start, end });
                    }}>
                    {TIMES.map((t) => <option key={t}>{t}</option>)}
                  </Select>
                  <span className="text-soft">–</span>
                  <Select aria-label="Конец" value={mForm.end} className="!border-0 !bg-transparent !px-1 !py-2.5 !ring-0 focus:!ring-0"
                    onChange={(e) => setMForm({ ...mForm, end: e.target.value })}>
                    {TIMES.map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </div>
                <Input placeholder="Место" value={mForm.location} onChange={(e) => setMForm({ ...mForm, location: e.target.value })} className="sm:col-span-2" />
              </div>
              <Button onClick={addMeeting} disabled={busy || !mForm.title.trim()} className="self-end">{busy ? "Добавляю…" : "Создать встречу"}</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input placeholder="Задача" value={tForm.title} onChange={(e) => setTForm({ ...tForm, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addTask()} />
              <div className="flex items-center gap-2">
                <Input type="date" value={tForm.date} onChange={(e) => setTForm({ ...tForm, date: e.target.value })} className="max-w-[180px]" />
                <Button onClick={addTask} disabled={busy || !tForm.title.trim()} className="ml-auto">{busy ? "Добавляю…" : "Создать задачу"}</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {msg && <div className="mb-4 rounded-xl bg-sage-soft/60 px-4 py-2.5 text-sm text-ink/80">{msg}</div>}

      {error && (
        <Card className="mb-4 bg-butter-soft/60">
          <p className="text-sm text-ink/80">
            Не удалось получить события: {error}. Выйдите и войдите снова, разрешив доступ к календарю.
          </p>
        </Card>
      )}

      {events === null ? (
        <Card><div className="h-32 animate-pulse rounded-xl bg-line/60" /></Card>
      ) : view === "day" ? (
        <Card>
          <h2 className="mb-4 font-display text-lg font-semibold">
            Сегодня · {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
          </h2>
          {dayEvents.length === 0 ? (
            <Empty title="Сегодня встреч нет" hint="Тихий день — хорошее время для глубокой работы." />
          ) : (
            <div className="relative ml-2 border-l-2 border-line pl-5">
              {dayEvents.map((e, i) => (
                <div key={e.id} className="relative pb-5 last:pb-0">
                  <span className={cn("absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-bg", PASTELS[i % PASTELS.length].split(" ")[0])} />
                  <div className="text-xs font-semibold text-soft">
                    {e.allDay ? "Весь день" : `${fmt(e.start)} — ${fmt(e.end)}`}
                  </div>
                  <div className={cn("mt-1 inline-block rounded-xl px-3.5 py-2.5", PASTELS[i % PASTELS.length])}>
                    <div className="text-sm font-semibold">{e.title}</div>
                    {e.location && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs opacity-80">
                        <MapPin size={11} /> {e.location}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {[...Array(7)].map((_, d) => {
            const date = new Date();
            date.setDate(date.getDate() + d);
            const list = byDay.get(date.toDateString()) ?? [];
            return (
              <Card key={d} className={cn(d === 0 && "ring-1 ring-iris/30")}>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="font-display text-base font-semibold capitalize">
                    {date.toLocaleDateString("ru-RU", { weekday: "long" })}
                  </span>
                  <span className="text-xs text-soft">{date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
                </div>
                {list.length === 0 ? (
                  <p className="text-sm text-soft/70">Свободно</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {list.map((e, i) => (
                      <div key={e.id} className={cn("rounded-xl px-3 py-2 text-sm", PASTELS[i % PASTELS.length])}>
                        <span className="font-semibold">{e.allDay ? "Весь день" : fmt(e.start)}</span> · {e.title}
                        {e.link && (
                          <a href={e.link} target="_blank" rel="noreferrer" className="ml-1.5 inline-block align-middle opacity-70 hover:opacity-100" aria-label="Открыть в Google Calendar">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-center text-xs text-soft">
        События читаются из Google Calendar. Создание событий — только после вашего подтверждения (появится в Блоке 2 вместе с pending-запросами).
      </p>
    </div>
  );
}
