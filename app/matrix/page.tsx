"use client";

import { useEffect, useState } from "react";
import { Card, SectionTitle, Empty, Badge } from "@/components/ui";
import { CATEGORY_STYLE, cn, type Category } from "@/lib/utils";

type Task = { id: string; title: string; category: Category; quadrant: string | null; status: string };

const QUADRANTS = [
  { id: "q1", title: "Срочно и важно", hint: "Сделать сейчас", tone: "from-rose-soft/80 to-white/60", ring: "ring-rose/30" },
  { id: "q2", title: "Важно, не срочно", hint: "Запланировать", tone: "from-sage-soft/80 to-white/60", ring: "ring-sage/30" },
  { id: "q3", title: "Срочно, не важно", hint: "Делегировать или упростить", tone: "from-butter-soft/80 to-white/60", ring: "ring-butter/30" },
  { id: "q4", title: "Не срочно, не важно", hint: "Отпустить", tone: "from-line/60 to-white/60", ring: "ring-soft/20" },
] as const;

export default function MatrixPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tasks").then((r) => (r.ok ? r.json() : [])).then(setTasks).catch(() => setTasks([]));
  }, []);

  async function moveTo(quadrant: string | null, id?: string | null) {
    const taskId = id ?? dragId;
    if (!taskId) return;
    setTasks((prev) => (prev ?? []).map((t) => (t.id === taskId ? { ...t, quadrant } : t)));
    setDragId(null);
    setOver(null);
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, quadrant }),
    });
  }

  const unsorted = (tasks ?? []).filter((t) => !t.quadrant && t.status !== "done");

  function TaskPill({ t }: { t: Task }) {
    return (
      <div
        draggable
        onDragStart={() => setDragId(t.id)}
        onDragEnd={() => { setDragId(null); setOver(null); }}
        className={cn(
          "flex cursor-grab items-center gap-2 rounded-xl bg-white/90 px-3 py-2 text-sm font-medium shadow-card transition active:cursor-grabbing",
          dragId === t.id && "opacity-40"
        )}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", CATEGORY_STYLE[t.category]?.dot ?? "bg-soft")} />
        <span className="flex-1">{t.title}</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <SectionTitle eyebrow="Что действительно важно" title="Матрица Эйзенхауэра" />

      {/* Неразобранные задачи */}
      <Card
        className={cn("mb-4 transition", over === "inbox" && "ring-2 ring-iris/40")}
        // позволяем вернуть задачу из квадранта
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setOver("inbox"); }}
          onDragLeave={() => setOver(null)}
          onDrop={() => moveTo(null)}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">Неразобранные задачи</span>
            <span className="text-xs text-soft">перетащите в квадрант</span>
          </div>
          {tasks === null ? (
            <div className="h-10 animate-pulse rounded-xl bg-line/60" />
          ) : unsorted.length === 0 ? (
            <p className="py-1 text-sm text-soft">Все активные задачи распределены.</p>
          ) : (
            <div className="flex flex-wrap gap-2">{unsorted.map((t) => <TaskPill key={t.id} t={t} />)}</div>
          )}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {QUADRANTS.map((q) => {
          const items = (tasks ?? []).filter((t) => t.quadrant === q.id && t.status !== "done");
          return (
            <div
              key={q.id}
              onDragOver={(e) => { e.preventDefault(); setOver(q.id); }}
              onDragLeave={() => setOver(null)}
              onDrop={() => moveTo(q.id)}
              className={cn(
                "glass min-h-44 bg-gradient-to-br p-4 transition",
                q.tone,
                over === q.id && `ring-2 ${q.ring}`
              )}
            >
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-display text-base font-semibold">{q.title}</h2>
                <span className="text-[11px] font-semibold text-soft">{q.hint}</span>
              </div>
              {items.length === 0 ? (
                <p className="py-3 text-center text-xs text-soft/70">Перетащите задачи сюда</p>
              ) : (
                <div className="space-y-2">{items.map((t) => <TaskPill key={t.id} t={t} />)}</div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-xs text-soft">
        Задачи общие с планером — распределение сохраняется автоматически.
      </p>
    </div>
  );
}
