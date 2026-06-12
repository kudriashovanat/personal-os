"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X, Check } from "lucide-react";
import { Button, Textarea, Chip } from "@/components/ui";
import { detectDateTime } from "@/lib/utils";

const NOTE_TYPES = ["Мысль", "Задача", "Идея поста", "Встреча", "Личное", "Работа"] as const;

export function QuickNote() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [type, setType] = useState<(typeof NOTE_TYPES)[number]>("Мысль");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<null | { savedTo: string; calendarHint: boolean }>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/quick-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить");
      setResult({ savedTo: data.savedTo, calendarHint: detectDateTime(text) });
      setText("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        aria-label="Быстрая заметка"
        onClick={() => { setOpen(true); setResult(null); }}
        className="fixed bottom-6 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-iris text-white shadow-lift transition-transform hover:scale-105 active:scale-95"
      >
        <Plus size={24} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 backdrop-blur-sm p-4 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="glass-strong w-full max-w-lg p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="eyebrow">Быстрая заметка</div>
                  <div className="font-display text-xl font-semibold">Поймать мысль</div>
                </div>
                <button aria-label="Закрыть" onClick={() => setOpen(false)} className="rounded-full p-2 text-soft hover:bg-white">
                  <X size={18} />
                </button>
              </div>

              {result ? (
                <div className="flex flex-col items-start gap-3 py-2">
                  <div className="flex items-center gap-2 text-sage">
                    <Check size={18} />
                    <span className="text-sm font-semibold text-ink">Сохранено в {result.savedTo}</span>
                  </div>
                  {result.calendarHint && (
                    <div className="rounded-xl bg-sky-soft px-3.5 py-2.5 text-sm text-sky">
                      Похоже, в заметке есть дата или время. Добавить событие можно в разделе «Календарь» — ничего не создаётся автоматически.
                    </div>
                  )}
                  <Button variant="soft" onClick={() => setResult(null)}>Ещё заметка</Button>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {NOTE_TYPES.map((t) => (
                      <Chip key={t} active={type === t} onClick={() => setType(t)}>{t}</Chip>
                    ))}
                  </div>
                  <Textarea
                    autoFocus
                    rows={4}
                    placeholder="Запишите мысль, идею или задачу — она попадёт в Inbox вашего Obsidian…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  {error && <div className="mt-2 rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose">{error}</div>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-soft">→ Obsidian · Inbox</span>
                    <Button onClick={save} disabled={saving || !text.trim()}>
                      {saving ? "Сохраняю…" : "Сохранить"}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
