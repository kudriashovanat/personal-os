"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, Flag, X, Pencil } from "lucide-react";
import { Card, SectionTitle, Button, Input, Select, Textarea, Checkbox, Progress, Badge, Chip, Empty } from "@/components/ui";
import { CATEGORIES, CATEGORY_STYLE, todayISO, cn, type Category } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  description?: string | null;
  category: Category;
  priority: number;
  status: "todo" | "doing" | "done";
  quadrant?: string | null;
  tags?: string[] | null;
  due_date: string | null;
};

const QUADRANTS: { id: string; label: string }[] = [
  { id: "", label: "—" },
  { id: "q1", label: "Срочно и важно" },
  { id: "q2", label: "Важно, не срочно" },
  { id: "q3", label: "Срочно, не важно" },
  { id: "q4", label: "Не срочно, не важно" },
];

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
  const [editId, setEditId] = useState<string | null>(null);

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
                <button onClick={() => setEditId(t.id)} className={cn("flex-1 text-left text-sm font-medium hover:text-iris-deep", t.status === "done" && "text-soft line-through")}>
                  {t.title}
                  {t.description && <Pencil size={11} className="ml-1.5 inline text-soft/50" />}
                  {t.due_date && t.due_date < todayISO() && t.status !== "done" && (
                    <Badge className="ml-2 bg-peach-soft text-peach align-middle">перенесена</Badge>
                  )}
                </button>
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

      {editId && (() => {
        const t = (tasks ?? []).find((x) => x.id === editId);
        return t ? <TaskDrawer task={t} onClose={() => setEditId(null)} onPatch={patch} onRemove={(id) => { remove(id); setEditId(null); }} /> : null;
      })()}
    </div>
  );
}

function TaskDrawer({ task, onClose, onPatch, onRemove }: {
  task: Task;
  onClose: () => void;
  onPatch: (id: string, p: Partial<Task>) => void;
  onRemove: (id: string) => void;
}) {
  const [local, setLocal] = useState(task);
  useEffect(() => setLocal(task), [task.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (p: Partial<Task>) => onPatch(task.id, p);
  const saveTitle = () => { const v = (local.title ?? "").trim(); if (v && v !== task.title) save({ title: v }); };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-strong relative ml-auto flex h-full w-full max-w-md flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line/70 p-4">
          <span className="eyebrow">Задача</span>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-full p-1.5 text-soft hover:bg-white/70"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            <Field label="Название">
              <Input value={local.title} onChange={(e) => setLocal({ ...local, title: e.target.value })} onBlur={saveTitle} />
            </Field>
            <Field label="Описание">
              <Textarea rows={4} value={local.description ?? ""} onChange={(e) => setLocal({ ...local, description: e.target.value })} onBlur={() => save({ description: local.description ?? null })} placeholder="Детали, контекст, ссылки…" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Дедлайн">
                <Input type="date" value={local.due_date ?? ""} onChange={(e) => { setLocal({ ...local, due_date: e.target.value }); save({ due_date: e.target.value || null }); }} />
              </Field>
              <Field label="Приоритет">
                <Select value={local.priority} onChange={(e) => { const v = Number(e.target.value); setLocal({ ...local, priority: v }); save({ priority: v }); }} className="w-full">
                  <option value={1}>P1 · высокий</option><option value={2}>P2 · средний</option><option value={3}>P3 · низкий</option>
                </Select>
              </Field>
              <Field label="Статус">
                <Select value={local.status} onChange={(e) => { const v = e.target.value as Task["status"]; setLocal({ ...local, status: v }); save({ status: v }); }} className="w-full">
                  <option value="todo">К выполнению</option><option value="doing">В работе</option><option value="done">Готово</option>
                </Select>
              </Field>
              <Field label="Фильтр / категория">
                <Select value={local.category} onChange={(e) => { const v = e.target.value as Category; setLocal({ ...local, category: v }); save({ category: v }); }} className="w-full">
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="Матрица Эйзенхауэра">
              <Select value={local.quadrant ?? ""} onChange={(e) => { const v = e.target.value || null; setLocal({ ...local, quadrant: v }); save({ quadrant: v }); }} className="w-full">
                {QUADRANTS.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
              </Select>
            </Field>

            <Field label="Теги" hint="через запятую">
              <Input value={(local.tags ?? []).join(", ")} onChange={(e) => setLocal({ ...local, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} onBlur={() => save({ tags: local.tags ?? [] })} placeholder="напр. собеседование, срочно" />
            </Field>

            <Button variant="danger" className="self-start" onClick={() => onRemove(task.id)}><Trash2 size={15} /> Удалить задачу</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-soft">{label}{hint ? ` · ${hint}` : ""}</div>
      {children}
    </div>
  );
}
