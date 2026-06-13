"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, Flag } from "lucide-react";
import { Card, SectionTitle, Button, Input, Select, Checkbox, Progress, Badge, Chip, Empty } from "@/components/ui";
import { CATEGORIES, CATEGORY_STYLE, todayISO, cn, type Category } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  category: Category;
  priority: number;
  status: "todo" | "doing" | "done";
  due_date: string | null;
};

const PRIORITY_LABEL: Record<number, string> = { 1: "P1", 2: "P2", 3: "P3" };
const PRIORITY_STYLE: Record<number, string> = {
  1: "bg-rose-soft text-rose",
  2: "bg-butter-soft text-butter",
  3: "bg-line text-soft",
};

export default function PlannerPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("Главное");
  const [priority, setPriority] = useState(2);
  const [filter, setFilter] = useState<Category | "Все">("Все");
  const [sort, setSort] = useState<"priority" | "category" | "status">("priority");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch(`/api/tasks?date=${todayISO()}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setTasks(d);
    } catch (e: any) {
      setError(e.message);
      setTasks([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!title.trim()) return;
    const r = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), category, priority, due_date: todayISO() }),
    });
    if (r.ok) {
      setTitle("");
      const t = await r.json();
      setTasks((prev) => [...(prev ?? []), t]);
    }
  }

  async function patch(id: string, p: Partial<Task>) {
    setTasks((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, ...p } : t)));
    await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) });
  }

  async function remove(id: string) {
    setTasks((prev) => (prev ?? []).filter((t) => t.id !== id));
    await fetch("/api/tasks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  const visible = useMemo(() => {
    let list = [...(tasks ?? [])];
    if (filter !== "Все") list = list.filter((t) => t.category === filter);
    const order = { todo: 0, doing: 1, done: 2 };
    list.sort((a, b) =>
      sort === "priority" ? a.priority - b.priority
      : sort === "category" ? a.category.localeCompare(b.category, "ru")
      : order[a.status] - order[b.status]
    );
    return list;
  }, [tasks, filter, sort]);

  const done = (tasks ?? []).filter((t) => t.status === "done").length;
  const total = tasks?.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle eyebrow="План на сегодня" title="Планер" />

      <Card className="mb-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Новая задача…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <div className="flex gap-2">
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="Категория">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select value={priority} onChange={(e) => setPriority(Number(e.target.value))} aria-label="Приоритет">
              <option value={1}>P1</option><option value={2}>P2</option><option value={3}>P3</option>
            </Select>
            <Button onClick={add} disabled={!title.trim()}>Добавить</Button>
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Chip active={filter === "Все"} onClick={() => setFilter("Все")}>Все</Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>{c}</Chip>
        ))}
        <div className="ml-auto">
          <Select value={sort} onChange={(e) => setSort(e.target.value as any)} className="!py-1.5 text-xs" aria-label="Сортировка">
            <option value="priority">По приоритету</option>
            <option value="category">По категории</option>
            <option value="status">По статусу</option>
          </Select>
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <div className="mb-1.5 flex justify-between text-xs font-semibold text-soft">
            <span>Выполнено</span><span>{done} / {total}</span>
          </div>
          <Progress value={total ? (done / total) * 100 : 0} />
        </div>

        {error && <div className="mb-3 rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose">{error}</div>}

        {tasks === null ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-line/60" />)}</div>
        ) : visible.length === 0 ? (
          <Empty title="Задач пока нет" hint="Добавьте первую задачу выше — она появится и на главном экране." />
        ) : (
          <ul className="space-y-1.5">
            {visible.map((t) => (
              <li key={t.id} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/70">
                <Checkbox
                  checked={t.status === "done"}
                  onChange={(v) => patch(t.id, { status: v ? "done" : "todo" })}
                  label={t.title}
                />
                <span className={cn("flex-1 text-sm font-medium", t.status === "done" && "text-soft line-through")}>
                  {t.title}
                  {t.due_date && t.due_date < todayISO() && t.status !== "done" && (
                    <Badge className="ml-2 bg-peach-soft text-peach align-middle">перенесена</Badge>
                  )}
                </span>
                <button
                  title="Сменить приоритет"
                  onClick={() => patch(t.id, { priority: (t.priority % 3) + 1 })}
                  className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", PRIORITY_STYLE[t.priority])}
                >
                  <Flag size={10} className="mr-0.5 inline" />{PRIORITY_LABEL[t.priority]}
                </button>
                <Badge className={CATEGORY_STYLE[t.category]?.chip ?? "bg-line"}>{t.category}</Badge>
                <Select
                  value={t.status}
                  onChange={(e) => patch(t.id, { status: e.target.value as Task["status"] })}
                  className="!px-2 !py-1 text-xs"
                  aria-label="Статус"
                >
                  <option value="todo">К выполнению</option>
                  <option value="doing">В работе</option>
                  <option value="done">Готово</option>
                </Select>
                <button
                  aria-label="Удалить"
                  onClick={() => remove(t.id)}
                  className="rounded-full p-1.5 text-soft/50 opacity-0 transition hover:bg-rose-soft hover:text-rose group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
