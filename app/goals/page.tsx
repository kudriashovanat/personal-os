"use client";

import { useEffect, useState } from "react";
import { Card, SectionTitle, Button, Input, Select, Badge, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Trash2, CheckCircle2 } from "lucide-react";

type Goal = { id: string; title: string; horizon: string; status: string; notes: string | null };

const HORIZONS = ["месяц", "квартал", "год", "3 года", "10 лет"];
const HORIZON_TONE: Record<string, string> = {
  "месяц": "from-iris-soft/70", "квартал": "from-sky-soft/70", "год": "from-sage-soft/70",
  "3 года": "from-peach-soft/70", "10 лет": "from-rose-soft/70",
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState(HORIZONS[0]);

  useEffect(() => {
    fetch("/api/collection/goals").then((r) => (r.ok ? r.json() : [])).then(setGoals).catch(() => setGoals([]));
  }, []);

  async function add() {
    if (!title.trim()) return;
    const r = await fetch("/api/collection/goals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), horizon }),
    });
    if (r.ok) {
      const created = await r.json();
      setGoals((p) => [created, ...(p ?? [])]);
      setTitle("");
    }
  }

  async function patch(id: string, p: Partial<Goal>) {
    setGoals((prev) => (prev ?? []).map((g) => (g.id === id ? { ...g, ...p } : g)));
    await fetch("/api/collection/goals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) });
  }

  async function remove(id: string) {
    setGoals((prev) => (prev ?? []).filter((g) => g.id !== id));
    await fetch("/api/collection/goals", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle eyebrow="От месяца до десятилетия" title="Цели" />

      <Card className="mb-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Новая цель…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Select value={horizon} onChange={(e) => setHorizon(e.target.value)}>
            {HORIZONS.map((h) => <option key={h}>{h}</option>)}
          </Select>
          <Button onClick={add} disabled={!title.trim()}>Добавить</Button>
        </div>
      </Card>

      {goals === null ? (
        <Card><div className="h-24 animate-pulse rounded-xl bg-line/60" /></Card>
      ) : (
        <div className="space-y-5">
          {HORIZONS.map((h) => {
            const list = (goals ?? []).filter((g) => g.horizon === h);
            return (
              <section key={h}>
                <div className="eyebrow mb-2 capitalize">{h}</div>
                {list.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-soft/70">Горизонт пока пуст</p>
                ) : (
                  <div className="space-y-2">
                    {list.map((g) => (
                      <div key={g.id} className={cn("glass group flex items-center gap-3 bg-gradient-to-r to-white/60 !p-4", HORIZON_TONE[h])}>
                        <button
                          aria-label="Отметить достигнутой"
                          onClick={() => patch(g.id, { status: g.status === "достигнута" ? "в работе" : "достигнута" })}
                          className={cn("transition", g.status === "достигнута" ? "text-sage" : "text-soft/40 hover:text-sage")}
                        >
                          <CheckCircle2 size={20} />
                        </button>
                        <span className={cn("flex-1 text-sm font-medium", g.status === "достигнута" && "text-soft line-through")}>{g.title}</span>
                        <Badge className="bg-white/80 text-soft">{g.status}</Badge>
                        <button aria-label="Удалить" onClick={() => remove(g.id)} className="rounded-full p-1.5 text-soft/40 opacity-0 transition hover:bg-rose-soft hover:text-rose group-hover:opacity-100">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          <p className="text-center text-xs text-soft">Связь целей с проектами, задачами и заметками появится в Блоке 3.</p>
        </div>
      )}
    </div>
  );
}
