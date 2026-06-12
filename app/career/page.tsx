"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, Button, Input, Select, Badge, Chip, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ExternalLink, Trash2, Languages } from "lucide-react";

type Item = {
  id: string; title: string; company: string | null; link: string | null;
  bucket: string; country: string | null; remote: boolean; level: string | null;
  hebrew_required: boolean; status: string; notes: string | null;
};

const BUCKETS = ["Высокий приоритет", "Вход на рынок Израиля", "Пограничные варианты"];
const STATUSES = ["посмотреть", "откликнуться", "откликнулась", "пропустить"];
const STATUS_STYLE: Record<string, string> = {
  "посмотреть": "bg-sky-soft text-sky",
  "откликнуться": "bg-butter-soft text-butter",
  "откликнулась": "bg-sage-soft text-sage",
  "пропустить": "bg-line text-soft",
};

export default function CareerPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [form, setForm] = useState({ title: "", company: "", link: "", bucket: BUCKETS[0], country: "", level: "", remote: false, hebrew_required: false });
  const [fBucket, setFBucket] = useState("Все");
  const [fStatus, setFStatus] = useState("Все");
  const [fRemote, setFRemote] = useState(false);

  useEffect(() => {
    fetch("/api/collection/career_items").then((r) => (r.ok ? r.json() : [])).then(setItems).catch(() => setItems([]));
  }, []);

  async function add() {
    if (!form.title.trim()) return;
    const r = await fetch("/api/collection/career_items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, link: form.link || null, company: form.company || null, country: form.country || null, level: form.level || null }),
    });
    if (r.ok) {
      const created = await r.json();
      setItems((p) => [created, ...(p ?? [])]);
      setForm({ ...form, title: "", company: "", link: "" });
    }
  }

  async function patch(id: string, p: Partial<Item>) {
    setItems((prev) => (prev ?? []).map((i) => (i.id === id ? { ...i, ...p } : i)));
    await fetch("/api/collection/career_items", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) });
  }

  async function remove(id: string) {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== id));
    await fetch("/api/collection/career_items", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  const visible = useMemo(() => (items ?? []).filter((i) =>
    (fBucket === "Все" || i.bucket === fBucket) &&
    (fStatus === "Все" || i.status === fStatus) &&
    (!fRemote || i.remote)
  ), [items, fBucket, fStatus, fRemote]);

  return (
    <div className="mx-auto max-w-4xl">
      <SectionTitle eyebrow="Поиск работы" title="Карьера" />

      <Card className="mb-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Роль (например, HRBP)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input placeholder="Компания" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <Input placeholder="Ссылка на вакансию" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
          <div className="flex gap-2">
            <Select value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} className="flex-1">
              {BUCKETS.map((b) => <option key={b}>{b}</option>)}
            </Select>
            <Input placeholder="Страна" className="w-28" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-soft">
            <input type="checkbox" checked={form.remote} onChange={(e) => setForm({ ...form, remote: e.target.checked })} className="accent-iris" /> Remote
          </label>
          <label className="flex items-center gap-1.5 text-sm text-soft">
            <input type="checkbox" checked={form.hebrew_required} onChange={(e) => setForm({ ...form, hebrew_required: e.target.checked })} className="accent-iris" /> Нужен иврит
          </label>
          <Button onClick={add} disabled={!form.title.trim()} className="ml-auto">Добавить вакансию</Button>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Chip active={fBucket === "Все"} onClick={() => setFBucket("Все")}>Все категории</Chip>
        {BUCKETS.map((b) => <Chip key={b} active={fBucket === b} onClick={() => setFBucket(b)}>{b}</Chip>)}
        <span className="mx-1 text-line">|</span>
        <Chip active={fRemote} onClick={() => setFRemote(!fRemote)}>Remote</Chip>
        <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="ml-auto !py-1.5 text-xs">
          <option>Все</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>

      {items === null ? (
        <Card><div className="h-24 animate-pulse rounded-xl bg-line/60" /></Card>
      ) : visible.length === 0 ? (
        <Card><Empty title="Вакансий нет" hint="Добавьте первую вручную — позже сюда будет писать Career Search Agent (Блок 3)." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((i) => (
            <Card key={i.id} className={cn("group flex flex-col gap-2.5", i.status === "пропустить" && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-base font-semibold leading-snug">{i.title}</div>
                  <div className="text-sm text-soft">{[i.company, i.country, i.level].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                {i.link && (
                  <a href={i.link} target="_blank" rel="noreferrer" className="rounded-full p-1.5 text-soft hover:bg-iris-soft hover:text-iris-deep" aria-label="Открыть вакансию">
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge className="bg-iris-soft text-iris-deep">{i.bucket}</Badge>
                {i.remote && <Badge className="bg-sky-soft text-sky">Remote</Badge>}
                {i.hebrew_required && (
                  <Badge className="bg-peach-soft text-peach"><Languages size={10} className="mr-1" /> Иврит</Badge>
                )}
              </div>
              <div className="mt-auto flex items-center gap-2 pt-1">
                <Select value={i.status} onChange={(e) => patch(i.id, { status: e.target.value })} className="flex-1 !py-1.5 text-xs">
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </Select>
                <Badge className={STATUS_STYLE[i.status]}>{i.status}</Badge>
                <button aria-label="Удалить" onClick={() => remove(i.id)} className="rounded-full p-1.5 text-soft/40 opacity-0 transition hover:bg-rose-soft hover:text-rose group-hover:opacity-100">
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
