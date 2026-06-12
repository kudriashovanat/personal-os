"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, Button, Input, Select, Badge, Chip, Empty } from "@/components/ui";
import { todayISO, cn } from "@/lib/utils";
import { Trash2, BellRing } from "lucide-react";

type Contact = {
  id: string; name: string; role: string | null; circle: string;
  last_contact: string | null; remind_after_days: number | null; notes: string | null;
};

const CIRCLES = ["друзья", "коллеги", "рекрутеры", "полезные знакомства"];
const CIRCLE_STYLE: Record<string, string> = {
  "друзья": "bg-rose-soft text-rose",
  "коллеги": "bg-sky-soft text-sky",
  "рекрутеры": "bg-iris-soft text-iris-deep",
  "полезные знакомства": "bg-sage-soft text-sage",
};

function daysSince(date: string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

export default function CrmPage() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [form, setForm] = useState({ name: "", role: "", circle: CIRCLES[1], remind_after_days: 30 });
  const [filter, setFilter] = useState("Все");

  useEffect(() => {
    fetch("/api/collection/contacts").then((r) => (r.ok ? r.json() : [])).then(setContacts).catch(() => setContacts([]));
  }, []);

  async function add() {
    if (!form.name.trim()) return;
    const r = await fetch("/api/collection/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role: form.role || null, last_contact: todayISO() }),
    });
    if (r.ok) {
      const created = await r.json();
      setContacts((p) => [created, ...(p ?? [])]);
      setForm({ ...form, name: "", role: "" });
    }
  }

  async function patch(id: string, p: Partial<Contact>) {
    setContacts((prev) => (prev ?? []).map((c) => (c.id === id ? { ...c, ...p } : c)));
    await fetch("/api/collection/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) });
  }

  async function remove(id: string) {
    setContacts((prev) => (prev ?? []).filter((c) => c.id !== id));
    await fetch("/api/collection/contacts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  const visible = useMemo(() => {
    const list = (contacts ?? []).filter((c) => filter === "Все" || c.circle === filter);
    // Сначала те, с кем пора связаться
    return list.sort((a, b) => {
      const od = (c: Contact) => {
        const d = daysSince(c.last_contact);
        return d !== null && c.remind_after_days ? d - c.remind_after_days : -9999;
      };
      return od(b) - od(a);
    });
  }, [contacts, filter]);

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle eyebrow="Тёплые связи" title="Люди" />

      <Card className="mb-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <Input placeholder="Имя" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Роль / компания" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          <Select value={form.circle} onChange={(e) => setForm({ ...form, circle: e.target.value })}>
            {CIRCLES.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Button onClick={add} disabled={!form.name.trim()}>Добавить</Button>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip active={filter === "Все"} onClick={() => setFilter("Все")}>Все</Chip>
        {CIRCLES.map((c) => <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>{c}</Chip>)}
      </div>

      {contacts === null ? (
        <Card><div className="h-24 animate-pulse rounded-xl bg-line/60" /></Card>
      ) : visible.length === 0 ? (
        <Card><Empty title="Контактов пока нет" hint="Начните с трёх людей, с которыми хочется не терять связь." /></Card>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => {
            const d = daysSince(c.last_contact);
            const due = d !== null && c.remind_after_days !== null && d >= c.remind_after_days;
            return (
              <Card key={c.id} className={cn("group flex items-center gap-3 !p-4", due && "ring-1 ring-peach/50")}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-iris-soft font-display text-base font-semibold text-iris-deep">
                  {c.name.trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{c.name}</span>
                    <Badge className={CIRCLE_STYLE[c.circle]}>{c.circle}</Badge>
                    {due && <Badge className="bg-peach-soft text-peach"><BellRing size={10} className="mr-1" /> пора связаться</Badge>}
                  </div>
                  <div className="truncate text-xs text-soft">
                    {c.role ? `${c.role} · ` : ""}
                    {d === null ? "ещё не общались" : d === 0 ? "общались сегодня" : `последний контакт ${d} дн. назад`}
                  </div>
                </div>
                <Button variant="soft" className="!px-3 !py-1.5 text-xs" onClick={() => patch(c.id, { last_contact: todayISO() })}>
                  Связалась
                </Button>
                <button aria-label="Удалить" onClick={() => remove(c.id)} className="rounded-full p-1.5 text-soft/40 opacity-0 transition hover:bg-rose-soft hover:text-rose group-hover:opacity-100">
                  <Trash2 size={14} />
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
