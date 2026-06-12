"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, Chip, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MapPin, ExternalLink } from "lucide-react";

type CalEvent = { id: string; title: string; start: string; end: string; allDay: boolean; location: string | null; link: string | null };

const PASTELS = ["bg-iris-soft text-iris-deep", "bg-sky-soft text-sky", "bg-sage-soft text-sage", "bg-peach-soft text-peach", "bg-rose-soft text-rose"];

export default function CalendarPage() {
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [view, setView] = useState<"day" | "week">("day");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calendar/events?days=7")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setEvents(d);
      })
      .catch((e) => { setError(e.message); setEvents([]); });
  }, []);

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
        eyebrow="Google Calendar · только чтение"
        title="Календарь"
        action={
          <div className="flex gap-1.5">
            <Chip active={view === "day"} onClick={() => setView("day")}>День</Chip>
            <Chip active={view === "week"} onClick={() => setView("week")}>Неделя</Chip>
          </div>
        }
      />

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
