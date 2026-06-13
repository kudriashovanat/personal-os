"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, Sparkles } from "lucide-react";
import { Card, Progress, Badge, Empty } from "@/components/ui";
import { ruDate, greeting, todayISO, CATEGORY_STYLE, cn, type Category } from "@/lib/utils";

type Task = { id: string; title: string; category: Category; priority: number; status: string };
type CalEvent = { id: string; title: string; start: string; end: string; allDay: boolean; location: string | null };

export default function TodayPage() {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [ideasCount, setIdeasCount] = useState<number | null>(null);
  const [wotd, setWotd] = useState<{ en: any; he: any } | null>(null);
  const [calError, setCalError] = useState(false);

  useEffect(() => {
    fetch(`/api/tasks?date=${todayISO()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTasks)
      .catch(() => setTasks([]));
    fetch("/api/calendar/events?days=1")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setEvents)
      .catch(() => { setEvents([]); setCalError(true); });
    fetch("/api/collection/content_ideas")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setIdeasCount(Array.isArray(d) ? d.filter((i: any) => i.status === "идея" || i.status === "черновик").length : 0))
      .catch(() => setIdeasCount(0));
    fetch("/api/learning?wotd=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWotd(d && !d.error ? d : null))
      .catch(() => setWotd(null));
  }, []);

  function plural(n: number, one: string, few: string, many: string) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  const done = tasks?.filter((t) => t.status === "done").length ?? 0;
  const total = tasks?.length ?? 0;
  const progress = total ? Math.round((done / total) * 100) : 0;

  const priorities = useMemo(
    () => (tasks ?? []).filter((t) => t.status !== "done").sort((a, b) => a.priority - b.priority).slice(0, 3),
    [tasks]
  );
  const focus = priorities[0];

  const nextEvent = useMemo(() => {
    const now = Date.now();
    return (events ?? []).find((e) => !e.allDay && new Date(e.start).getTime() > now) ?? (events ?? [])[0];
  }, [events]);

  const summary = useMemo(() => {
    if (tasks === null) return "";
    if (total === 0) return "День свободен от задач — хорошее время поймать пару идей в быструю заметку.";
    if (progress === 100) return "Все задачи дня закрыты. Можно записать рефлексию и выдохнуть.";
    const left = total - done;
    return `Сделано ${done} из ${total}. Осталось ${left} — фокус на главном, остальное подождёт.`;
  }, [tasks, total, done, progress]);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Сигнатурный блок: приветствие и фокус дня */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="px-1 pb-8 pt-6 lg:pt-2"
      >
        <div className="eyebrow">{ruDate()}</div>
        <h1 className="mt-2 font-display text-4xl font-light leading-tight tracking-tight lg:text-5xl">
          {greeting(session?.user?.name)}
        </h1>
        {tasks !== null && (
          <p className="mt-3 text-sm font-light text-soft">
            у тебя {total} {plural(total, "задача", "задачи", "задач")}
            {(events ?? []).length > 0 && `, ${(events ?? []).length} ${plural((events ?? []).length, "событие", "события", "событий")}`}
            {ideasCount != null && ideasCount > 0 && ` и ${ideasCount} ${plural(ideasCount, "идея", "идеи", "идей")} для контента`}
          </p>
        )}
        <div className="mt-4 flex items-start gap-2.5">
          <Sparkles size={18} className="mt-1 shrink-0 text-iris" />
          {focus ? (
            <p className="font-display text-xl text-ink/80 lg:text-2xl">
              Фокус дня — <span className="italic text-iris-deep">{focus.title}</span>
            </p>
          ) : (
            <p className="font-display text-xl text-soft lg:text-2xl">
              Фокус дня пока не выбран — добавьте главную задачу в планере
            </p>
          )}
        </div>
      </motion.section>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Приоритеты */}
        <Card className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Три главных приоритета</h2>
            <Link href="/planner" className="flex items-center gap-1 text-sm font-semibold text-iris hover:text-iris-deep">
              Планер <ArrowRight size={14} />
            </Link>
          </div>
          {tasks === null ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-line/60" />)}</div>
          ) : priorities.length === 0 ? (
            <Empty title="Приоритеты не заданы" hint="Откройте планер и отметьте до трёх задач приоритетом 1." />
          ) : (
            <ol className="space-y-2.5">
              {priorities.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3 rounded-xl bg-white/70 px-4 py-3">
                  <span className="font-display text-lg font-semibold text-iris">{i + 1}</span>
                  <span className="flex-1 text-sm font-medium">{t.title}</span>
                  <Badge className={CATEGORY_STYLE[t.category]?.chip ?? "bg-line"}>{t.category}</Badge>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-5">
            <div className="mb-1.5 flex justify-between text-xs font-semibold text-soft">
              <span>Прогресс дня</span>
              <span>{done} / {total}</span>
            </div>
            <Progress value={progress} />
          </div>
        </Card>

        {/* Ближайшее событие + резюме */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <div className="mb-3 flex items-center gap-2 text-soft">
              <CalendarDays size={16} />
              <span className="eyebrow !text-soft">Ближайшее событие</span>
            </div>
            {events === null ? (
              <div className="h-14 animate-pulse rounded-xl bg-line/60" />
            ) : calError ? (
              <p className="text-sm text-soft">Календарь подключится после входа с доступом к Google Calendar.</p>
            ) : nextEvent ? (
              <div>
                <div className="font-display text-lg font-semibold">{nextEvent.title}</div>
                <div className="mt-1 text-sm text-soft">
                  {nextEvent.allDay
                    ? "Весь день"
                    : new Date(nextEvent.start).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  {nextEvent.location ? ` · ${nextEvent.location}` : ""}
                </div>
              </div>
            ) : (
              <p className="text-sm text-soft">Сегодня встреч больше нет.</p>
            )}
          </Card>

          <Card className="flex-1 bg-gradient-to-br from-iris-soft/60 to-sky-soft/40">
            <div className="eyebrow mb-2">Резюме дня</div>
            <p className="text-sm leading-relaxed text-ink/80">{summary}</p>
          </Card>
        </div>
      </div>

      {(wotd?.en || wotd?.he) && (
        <div className="mt-4">
          <div className="eyebrow mb-2">Слова дня</div>
          <div className="grid gap-4 sm:grid-cols-2">
            {wotd?.en && <WordCard item={wotd.en} label="English" />}
            {wotd?.he && <WordCard item={wotd.he} label="עברית" rtl />}
          </div>
        </div>
      )}
    </div>
  );
}

function WordCard({ item, label, rtl }: { item: any; label: string; rtl?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <Card>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Link href="/learning" className="text-xs font-semibold text-iris hover:text-iris-deep">все →</Link>
      </div>
      <div className={cn("font-display text-2xl font-medium leading-snug", rtl && "text-right [direction:rtl]")}>{item.term}</div>
      {show ? (
        <div className="mt-2">
          {item.transliteration && <div className="text-sm text-soft">[{item.transliteration}]</div>}
          <div className="text-base">{item.translation}</div>
          {item.example && <div className={cn("mt-1 text-xs italic text-soft", rtl && "text-right [direction:rtl]")}>{item.example}</div>}
        </div>
      ) : (
        <button onClick={() => setShow(true)} className="mt-2 text-sm font-semibold text-iris hover:text-iris-deep">Показать перевод</button>
      )}
    </Card>
  );
}
