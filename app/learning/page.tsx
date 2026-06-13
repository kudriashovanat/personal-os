"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, Button, Badge, Chip, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";
import { LANGS, LANG_LABEL, statusOf, type Lang } from "@/lib/learning";
import { Sparkles, Trash2, RotateCcw, Check, X } from "lucide-react";

type Item = {
  id: string; language: string; term: string; translation: string | null; transliteration: string | null;
  part_of_speech: string | null; example: string | null; note: string | null; category: string | null;
  level: string | null; box: number; due_date: string; reviews: number;
};

type Tab = "review" | "learning" | "learned" | "all";
const TABS: { id: Tab; label: string }[] = [
  { id: "review", label: "На повторение" },
  { id: "learning", label: "Учу" },
  { id: "learned", label: "Выучено" },
  { id: "all", label: "Все" },
];
const STATUS_STYLE: Record<string, string> = {
  new: "bg-sky-soft text-sky", learning: "bg-butter-soft text-butter", known: "bg-sage-soft text-sage",
};
const STATUS_LABEL: Record<string, string> = { new: "новое", learning: "учу", known: "выучено" };
const AGENT_OF: Record<Lang, string> = { en: "english-coach", he: "hebrew-coach" };
const todayISO = () => new Date().toISOString().slice(0, 10);
const ruDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

export default function LearningPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [tab, setTab] = useState<Tab>("review");
  const [items, setItems] = useState<Item[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [queue, setQueue] = useState<Item[]>([]);
  const [revealed, setRevealed] = useState(false);

  const load = useCallback(async (l: Lang) => {
    const r = await fetch(`/api/learning?language=${l}`);
    const d = await r.json();
    setItems(Array.isArray(d) ? d : []);
  }, []);
  useEffect(() => { setItems(null); load(lang); }, [lang, load]);

  const due = useMemo(() => (items ?? []).filter((i) => i.due_date <= todayISO()), [items]);
  const counts = useMemo(() => {
    const all = items ?? [];
    return {
      review: due.length,
      learning: all.filter((i) => statusOf(i.box, i.reviews) === "learning").length,
      learned: all.filter((i) => statusOf(i.box, i.reviews) === "known").length,
      all: all.length,
    };
  }, [items, due]);

  const listForTab = useMemo(() => {
    const all = items ?? [];
    if (tab === "learning") return all.filter((i) => statusOf(i.box, i.reviews) === "learning");
    if (tab === "learned") return all.filter((i) => statusOf(i.box, i.reviews) === "known");
    return all; // all
  }, [items, tab]);

  function startReview() { setQueue(due); setRevealed(false); }

  async function grade(id: string, g: "good" | "again") {
    setRevealed(false);
    setQueue((q) => q.slice(1));
    const r = await fetch("/api/learning", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, grade: g }) });
    if (r.ok) { const updated = await r.json(); setItems((p) => (p ?? []).map((i) => (i.id === id ? updated : i))); }
  }

  async function addWords() {
    setAdding(true); setMsg(null);
    try {
      const r = await fetch(`/api/agents/${AGENT_OF[lang]}/run`, { method: "POST" });
      const raw = await r.text();
      let data: any = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!r.ok || !data) throw new Error(data?.error || "Не удалось добавить — попробуйте ещё раз");
      setMsg(data.summary || "Добавлено");
      load(lang);
    } catch (e: any) { setMsg(e.message); } finally { setAdding(false); }
  }

  async function remove(id: string) {
    setItems((p) => (p ?? []).filter((i) => i.id !== id));
    await fetch("/api/learning", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  const card = queue[0];
  const rtl = lang === "he";

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        eyebrow="Learning OS"
        title="Изучение языков"
        action={<Button onClick={addWords} disabled={adding}><Sparkles size={15} /> {adding ? "Добавляю…" : "+5 карточек"}</Button>}
      />

      {/* Язык */}
      <div className="mb-3 flex items-center gap-2">
        {LANGS.map((l) => <Chip key={l} active={lang === l} onClick={() => setLang(l)}>{LANG_LABEL[l]}</Chip>)}
        {items && <span className="ml-auto text-xs text-soft">{items.length} карточек</span>}
      </div>

      {/* Статус-вкладки */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}{items ? ` · ${counts[t.id]}` : ""}
          </Chip>
        ))}
      </div>

      {msg && <div className="mb-4 rounded-xl bg-sage-soft/60 px-3 py-2 text-sm text-ink/80">{msg}</div>}

      {/* Вкладка «На повторение» — SRS */}
      {tab === "review" ? (
        card ? (
          <Card strong className="text-center">
            <div className="mb-1 text-xs text-soft">На повтор · осталось {queue.length}</div>
            <div className={cn("font-display text-3xl font-medium", rtl && "[direction:rtl]")}>{card.term}</div>
            {revealed ? (
              <div className="mt-3 flex flex-col gap-1.5">
                {card.transliteration && <div className="text-sm text-soft">[{card.transliteration}]</div>}
                <div className="text-lg">{card.translation}</div>
                {card.example && <div className={cn("mt-1 text-sm italic text-soft", rtl && "[direction:rtl]")}>{card.example}</div>}
                {card.note && <div className="mt-1 text-xs text-soft/80">{card.note}</div>}
                <div className="mt-3 flex justify-center gap-2">
                  <Button variant="danger" onClick={() => grade(card.id, "again")}><X size={15} /> Не знаю</Button>
                  <Button onClick={() => grade(card.id, "good")} className="bg-sage hover:bg-sage"><Check size={15} /> Знаю</Button>
                </div>
              </div>
            ) : (
              <Button variant="soft" className="mt-4" onClick={() => setRevealed(true)}>Показать перевод</Button>
            )}
          </Card>
        ) : due.length > 0 ? (
          <Card strong className="flex items-center justify-between">
            <span className="text-sm">На повтор сегодня: <b>{due.length}</b></span>
            <Button onClick={startReview}><RotateCcw size={15} /> Начать повторение</Button>
          </Card>
        ) : (
          <Card><Empty title="На сегодня повторений нет 🎉" hint="Карточки вернутся, когда подойдёт их интервал. Загляни во вкладку «Все» или добавь новые." /></Card>
        )
      ) : items === null ? (
        <Card><div className="h-24 animate-pulse rounded-xl bg-line/60" /></Card>
      ) : listForTab.length === 0 ? (
        <Card><Empty title="Здесь пока пусто" hint={tab === "learned" ? "Карточки попадают сюда после нескольких успешных повторений." : "Нажмите «+5 карточек», чтобы добавить новые слова."} /></Card>
      ) : (
        <div className="flex flex-col gap-2">
          {listForTab.map((i) => {
            const st = statusOf(i.box, i.reviews);
            const future = i.due_date > todayISO();
            return (
              <Card key={i.id} className="group flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-display text-base font-semibold", rtl && "[direction:rtl]")}>{i.term}</span>
                    {i.transliteration && <span className="text-xs text-soft">[{i.transliteration}]</span>}
                    {i.level && <Badge className="bg-iris-soft text-iris-deep">{i.level}</Badge>}
                  </div>
                  <div className="text-sm text-soft">{i.translation}{i.part_of_speech ? ` · ${i.part_of_speech}` : ""}</div>
                  {i.example && <div className={cn("mt-0.5 text-xs italic text-soft/80", rtl && "[direction:rtl]")}>{i.example}</div>}
                  <div className="mt-1 text-[11px] text-soft/70">
                    {st === "known" ? "выучено" : future ? `след. повтор: ${ruDate(i.due_date)}` : "ждёт повторения сегодня"}
                  </div>
                </div>
                <Badge className={STATUS_STYLE[st]}>{STATUS_LABEL[st]}</Badge>
                <button aria-label="Удалить" onClick={() => remove(i.id)} className="rounded-full p-1.5 text-soft/40 opacity-0 transition hover:bg-rose-soft hover:text-rose group-hover:opacity-100">
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
