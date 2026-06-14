"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, Button, Input, Textarea, Badge, Chip, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Lightbulb, Trash2, X, ExternalLink, Sparkles, CheckSquare, PenLine, Archive, StickyNote } from "lucide-react";

type Idea = {
  id: string; title: string | null; content: string; tags: string[] | null; source: string; status: string;
  drive_link: string | null; ai_action: string | null; ai_reason: string | null; created_at: string;
};
type Suggestion = {
  action: "task" | "content" | "note" | "archive"; reason: string;
  task: { title: string; description: string; due_date: string | null; priority: number; tags: string[] } | null;
  content: { title: string; platform: "Telegram" | "LinkedIn" } | null;
};

const STATUSES = [
  { id: "all", label: "Все" }, { id: "new", label: "Новые" }, { id: "processed", label: "Обработаны" }, { id: "archived", label: "Архив" },
];
const STATUS_STYLE: Record<string, string> = { new: "bg-sky-soft text-sky", processed: "bg-sage-soft text-sage", archived: "bg-line text-soft" };
const ACTION_META: Record<string, { label: string; icon: any }> = {
  task: { label: "Задача", icon: CheckSquare }, content: { label: "Контент", icon: PenLine },
  note: { label: "Заметка", icon: StickyNote }, archive: { label: "Архив", icon: Archive },
};

export default function IdeasPage() {
  const [items, setItems] = useState<Idea[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", tags: "" });
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/ideas");
    setItems(r.ok ? await r.json() : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => (items ?? []).filter((i) => filter === "all" || i.status === filter), [items, filter]);

  async function add() {
    if (!form.content.trim()) return;
    const r = await fetch("/api/ideas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title || null, content: form.content, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) }),
    });
    if (r.ok) { const created = await r.json(); setItems((p) => [created, ...(p ?? [])]); setForm({ title: "", content: "", tags: "" }); setAdding(false); }
  }
  async function patch(id: string, p: Partial<Idea>) {
    setItems((prev) => (prev ?? []).map((i) => (i.id === id ? { ...i, ...p } : i)));
    await fetch("/api/ideas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) });
  }
  async function remove(id: string) {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== id));
    if (openId === id) setOpenId(null);
    await fetch("/api/ideas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  const open = openId ? (items ?? []).find((i) => i.id === openId) ?? null : null;

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle eyebrow="Capture" title="Ideas"
        action={<Button variant={adding ? "ghost" : "primary"} onClick={() => setAdding((v) => !v)}>{adding ? "Отмена" : "+ Идея"}</Button>} />

      {adding && (
        <Card className="mb-4 flex flex-col gap-2">
          <Input placeholder="Заголовок (необязательно)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea rows={3} placeholder="Мысль, идея, набросок…" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          <div className="flex items-center gap-2">
            <Input placeholder="Теги через запятую" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            <Button onClick={add} disabled={!form.content.trim()}>Сохранить</Button>
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {STATUSES.map((s) => <Chip key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)}>{s.label}</Chip>)}
        {items && <span className="ml-auto text-xs text-soft">{visible.length}</span>}
      </div>

      {items === null ? (
        <Card><div className="h-24 animate-pulse rounded-xl bg-line/60" /></Card>
      ) : visible.length === 0 ? (
        <Card><Empty icon={<Lightbulb size={20} />} title="Идей нет" hint="Добавьте первую мысль выше или через «Быструю мысль» — всё попадает сюда." /></Card>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((i) => (
            <Card key={i.id} className="group flex items-start gap-3">
              <button onClick={() => setOpenId(i.id)} className="min-w-0 flex-1 text-left">
                <div className="font-display text-sm font-semibold leading-snug">{i.title || i.content.slice(0, 60)}</div>
                {i.title && <div className="mt-0.5 line-clamp-2 text-sm text-soft">{i.content}</div>}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {(i.tags ?? []).slice(0, 4).map((t) => <Badge key={t} className="bg-iris-soft text-iris-deep">#{t}</Badge>)}
                  {i.ai_action && <Badge className="bg-butter-soft text-butter">AI: {ACTION_META[i.ai_action]?.label ?? i.ai_action}</Badge>}
                </div>
              </button>
              <Badge className={STATUS_STYLE[i.status]}>{i.status === "new" ? "новое" : i.status === "processed" ? "обработано" : "архив"}</Badge>
              <button aria-label="Удалить" onClick={() => remove(i.id)} className="rounded-full p-1.5 text-soft/40 opacity-0 transition hover:bg-rose-soft hover:text-rose group-hover:opacity-100"><Trash2 size={14} /></button>
            </Card>
          ))}
        </div>
      )}

      {open && <IdeaDrawer idea={open} onClose={() => setOpenId(null)} onPatch={patch} onRemove={remove} onProcessed={load} />}
    </div>
  );
}

function IdeaDrawer({ idea, onClose, onPatch, onRemove, onProcessed }: {
  idea: Idea; onClose: () => void; onPatch: (id: string, p: Partial<Idea>) => void; onRemove: (id: string) => void; onProcessed: () => void;
}) {
  const [local, setLocal] = useState(idea);
  useEffect(() => setLocal(idea), [idea.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function suggest() {
    setLoading(true); setSug(null); setDone(null);
    try {
      const r = await fetch("/api/ideas/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось");
      setSug(d);
    } catch (e: any) { setDone(e.message); } finally { setLoading(false); }
  }
  async function createTask() {
    if (!sug?.task) return;
    await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: sug.task.title, description: sug.task.description, due_date: sug.task.due_date, priority: sug.task.priority, tags: sug.task.tags }) });
    onPatch(idea.id, { status: "processed" }); setDone("Задача создана в Planner ✓"); onProcessed();
  }
  async function toContent() {
    if (!sug?.content) return;
    await fetch("/api/collection/content_ideas", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: sug.content.title, platform: sug.content.platform, status: "идея" }) });
    onPatch(idea.id, { status: "processed" }); setDone("Добавлено в Content Ideas ✓"); onProcessed();
  }
  function mark(status: string, label: string) { onPatch(idea.id, { status }); setDone(label); }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-strong relative ml-auto flex h-full w-full max-w-lg flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line/70 p-4">
          <span className="eyebrow">Идея</span>
          <div className="flex items-center gap-2">
            {idea.drive_link && <a href={idea.drive_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-iris-deep hover:underline"><ExternalLink size={12} /> Second Brain</a>}
            <button onClick={onClose} aria-label="Закрыть" className="rounded-full p-1.5 text-soft hover:bg-white/70"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            <Input value={local.title ?? ""} onChange={(e) => setLocal({ ...local, title: e.target.value })} onBlur={() => onPatch(idea.id, { title: local.title || null })} placeholder="Заголовок" />
            <Textarea rows={6} value={local.content} onChange={(e) => setLocal({ ...local, content: e.target.value })} onBlur={() => local.content.trim() && onPatch(idea.id, { content: local.content })} />
            <div className="flex items-center gap-2">
              <Input value={(local.tags ?? []).join(", ")} onChange={(e) => setLocal({ ...local, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} onBlur={() => onPatch(idea.id, { tags: local.tags ?? [] })} placeholder="Теги" />
              <select value={local.status} onChange={(e) => { setLocal({ ...local, status: e.target.value }); onPatch(idea.id, { status: e.target.value }); }} className="rounded-xl border border-line bg-white/80 px-3 py-2.5 text-sm">
                <option value="new">новое</option><option value="processed">обработано</option><option value="archived">архив</option>
              </select>
            </div>

            <Button variant="soft" onClick={suggest} disabled={loading}><Sparkles size={15} /> {loading ? "Думаю…" : "Предложить действие"}</Button>
            {done && <div className="rounded-lg bg-sage-soft/60 px-3 py-2 text-sm text-ink/80">{done}</div>}

            {sug && (
              <div className="rounded-xl border border-line/70 p-3 text-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Badge className="bg-iris-soft text-iris-deep">{ACTION_META[sug.action]?.label ?? sug.action}</Badge>
                  <span className="text-soft">{sug.reason}</span>
                </div>
                {sug.action === "task" && sug.task && (
                  <div className="flex flex-col gap-1.5">
                    <div><b>{sug.task.title}</b></div>
                    {sug.task.description && <div className="text-soft">{sug.task.description}</div>}
                    <div className="flex flex-wrap gap-2 text-xs text-soft">
                      <span>Приоритет P{sug.task.priority}</span>
                      {sug.task.due_date && <span>· до {sug.task.due_date}</span>}
                      {sug.task.tags.length > 0 && <span>· {sug.task.tags.map((t) => `#${t}`).join(" ")}</span>}
                    </div>
                    <Button className="mt-1 self-start" onClick={createTask}><CheckSquare size={15} /> Создать задачу</Button>
                  </div>
                )}
                {sug.action === "content" && sug.content && (
                  <div className="flex flex-col gap-1.5">
                    <div><b>{sug.content.title}</b> · {sug.content.platform}</div>
                    <Button className="mt-1 self-start" onClick={toContent}><PenLine size={15} /> Добавить в Content Ideas</Button>
                  </div>
                )}
                {sug.action === "note" && <Button variant="soft" className="self-start" onClick={() => mark("processed", "Оставлено заметкой ✓")}><StickyNote size={15} /> Оставить заметкой</Button>}
                {sug.action === "archive" && <Button variant="ghost" className="self-start" onClick={() => mark("archived", "В архиве ✓")}><Archive size={15} /> Архивировать</Button>}
              </div>
            )}

            <Button variant="danger" className="self-start" onClick={() => onRemove(idea.id)}><Trash2 size={15} /> Удалить идею</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
