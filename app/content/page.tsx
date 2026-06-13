"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, Button, Input, Select, Badge, Chip, Empty, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Trash2, Send, Linkedin } from "lucide-react";

type Idea = {
  id: string; title: string; platform: "Telegram" | "LinkedIn";
  topic: string | null; hook: string | null; series: string | null; status: string; drive_link?: string | null;
};

const STATUSES = ["идея", "черновик", "готово", "опубликовано"];
const STATUS_STYLE: Record<string, string> = {
  "идея": "bg-iris-soft text-iris-deep",
  "черновик": "bg-butter-soft text-butter",
  "готово": "bg-sky-soft text-sky",
  "опубликовано": "bg-sage-soft text-sage",
};

export default function ContentPage() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [form, setForm] = useState({ title: "", platform: "Telegram" as Idea["platform"], topic: "", hook: "", series: "" });
  const [fPlatform, setFPlatform] = useState<"Все" | Idea["platform"]>("Все");
  const [fStatus, setFStatus] = useState("Все");

  useEffect(() => {
    fetch("/api/collection/content_ideas").then((r) => (r.ok ? r.json() : [])).then(setIdeas).catch(() => setIdeas([]));
  }, []);

  async function add() {
    if (!form.title.trim()) return;
    const r = await fetch("/api/collection/content_ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, topic: form.topic || null, hook: form.hook || null, series: form.series || null }),
    });
    if (r.ok) {
      const created = await r.json();
      setIdeas((p) => [created, ...(p ?? [])]);
      setForm({ ...form, title: "", hook: "" });
    }
  }

  async function patch(id: string, p: Partial<Idea>) {
    setIdeas((prev) => (prev ?? []).map((i) => (i.id === id ? { ...i, ...p } : i)));
    await fetch("/api/collection/content_ideas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) });
  }

  async function remove(id: string) {
    setIdeas((prev) => (prev ?? []).filter((i) => i.id !== id));
    await fetch("/api/collection/content_ideas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  const [tgBusy, setTgBusy] = useState<string | null>(null);
  const [tgMsg, setTgMsg] = useState<Record<string, string>>({});
  async function toTelegram(id: string) {
    setTgBusy(id);
    setTgMsg((m) => ({ ...m, [id]: "" }));
    try {
      const r = await fetch("/api/content/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось");
      setTgMsg((m) => ({ ...m, [id]: "Отправлено в Telegram ✓" }));
      setIdeas((prev) => (prev ?? []).map((i) => (i.id === id ? { ...i, status: "черновик" } : i)));
    } catch (e: any) {
      setTgMsg((m) => ({ ...m, [id]: e.message }));
    } finally {
      setTgBusy(null);
    }
  }

  const visible = useMemo(() => (ideas ?? []).filter((i) =>
    (fPlatform === "Все" || i.platform === fPlatform) && (fStatus === "Все" || i.status === fStatus)
  ), [ideas, fPlatform, fStatus]);

  return (
    <div className="mx-auto max-w-4xl">
      <SectionTitle eyebrow="Telegram · LinkedIn" title="Контент-студия" />

      <Card className="mb-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input placeholder="Идея поста…" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as Idea["platform"] })}>
            <option>Telegram</option><option>LinkedIn</option>
          </Select>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Input placeholder="Тема" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          <Input placeholder="Серия (необязательно)" value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })} />
          <Button onClick={add} disabled={!form.title.trim()}>Добавить идею</Button>
        </div>
        <Textarea className="mt-2" rows={2} placeholder="Хук — первая фраза, которая зацепит…" value={form.hook} onChange={(e) => setForm({ ...form, hook: e.target.value })} />
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {(["Все", "Telegram", "LinkedIn"] as const).map((p) => (
          <Chip key={p} active={fPlatform === p} onClick={() => setFPlatform(p)}>{p}</Chip>
        ))}
        <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="ml-auto !py-1.5 text-xs">
          <option>Все</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>

      {ideas === null ? (
        <Card><div className="h-24 animate-pulse rounded-xl bg-line/60" /></Card>
      ) : visible.length === 0 ? (
        <Card><Empty title="Идей пока нет" hint="Запишите первую — или ловите их через быструю заметку с типом «Идея поста»." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((i) => (
            <Card key={i.id} className="group flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="font-display text-base font-semibold leading-snug">{i.title}</div>
                <span className={cn("rounded-full p-1.5", i.platform === "Telegram" ? "bg-sky-soft text-sky" : "bg-iris-soft text-iris-deep")}>
                  {i.platform === "Telegram" ? <Send size={13} /> : <Linkedin size={13} />}
                </span>
              </div>
              {i.hook && <p className="rounded-xl bg-white/70 px-3 py-2 text-sm italic text-ink/70">«{i.hook}»</p>}
              <div className="flex flex-wrap items-center gap-1.5">
                {i.topic && <Badge className="bg-line text-soft">{i.topic}</Badge>}
                {i.series && <Badge className="bg-peach-soft text-peach">Серия: {i.series}</Badge>}
                {i.drive_link && (
                  <a href={i.drive_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-iris-deep hover:underline">
                    <Send size={11} /> Second Brain
                  </a>
                )}
              </div>
              <div className="mt-auto flex items-center gap-2 pt-1">
                <Select value={i.status} onChange={(e) => patch(i.id, { status: e.target.value })} className="flex-1 !py-1.5 text-xs">
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </Select>
                <Badge className={STATUS_STYLE[i.status]}>{i.status}</Badge>
                <button aria-label="В Telegram" title="Черновик поста → мне в Telegram" onClick={() => toTelegram(i.id)} disabled={tgBusy === i.id}
                  className="rounded-full p-1.5 text-soft hover:bg-sky-soft hover:text-sky disabled:opacity-50">
                  <Send size={14} className={tgBusy === i.id ? "animate-pulse" : ""} />
                </button>
                <button aria-label="Удалить" onClick={() => remove(i.id)} className="rounded-full p-1.5 text-soft/40 opacity-0 transition hover:bg-rose-soft hover:text-rose group-hover:opacity-100">
                  <Trash2 size={14} />
                </button>
              </div>
              {tgMsg[i.id] && <p className="text-xs text-soft">{tgMsg[i.id]}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
