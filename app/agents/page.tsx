"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, SectionTitle, Badge, Button } from "@/components/ui";
import { Briefcase, TrendingUp, PenLine, CalendarDays, Send, Newspaper, Laptop, Play, Loader2, X, CheckCircle2, AlertCircle, Webhook, RefreshCw } from "lucide-react";

type Agent = { id: string; name: string; desc: string; runnable: boolean; via: string };
type Run = { id: string; agent: string; status: string; trigger: string; summary?: string; report?: any; error?: string; created_at: string; finished_at?: string };

const ICONS: Record<string, any> = {
  "career-search": Briefcase, "hr-trends": TrendingUp, "content-ideas": PenLine,
  "calendar-assistant": CalendarDays, "telegram-sources": Send, "personal-digest": Newspaper, "mac-organizer": Laptop,
};

function ruTime(s?: string) {
  if (!s) return "—";
  return new Date(s).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [lastRuns, setLastRuns] = useState<Record<string, Run>>({});
  const [anthropicReady, setAnthropicReady] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [reportOf, setReportOf] = useState<Run | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function syncDrive() {
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await fetch("/api/sync-drive", { method: "POST" });
      const raw = await r.text();
      let d: any = null; try { d = raw ? JSON.parse(raw) : null; } catch {}
      if (!r.ok || !d) throw new Error(d?.error || "Не удалось синхронизировать");
      setSyncMsg({ text: d.summary || "Готово", ok: true });
    } catch (e: any) {
      setSyncMsg({ text: e.message, ok: false });
    } finally {
      setSyncing(false);
    }
  }

  const load = useCallback(async () => {
    const r = await fetch("/api/agents");
    const data = await r.json();
    if (r.ok) { setAgents(data.agents); setLastRuns(data.lastRuns); setAnthropicReady(data.anthropicReady); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(id: string) {
    setRunning(id); setMsg(null);
    try {
      const r = await fetch(`/api/agents/${id}/run`, { method: "POST" });
      // Безопасный разбор: ответ может быть не JSON (таймаут/ошибка платформы Vercel).
      const raw = await r.text();
      let data: any = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { /* не JSON */ }

      if (!r.ok || !data) {
        const timeout = r.status === 504 || /timeout|FUNCTION_INVOCATION|An error occ/i.test(raw);
        const text = data?.error
          || (timeout
            ? "Агент не успел за лимит времени. Попробуйте ещё раз — поиск уже сокращён."
            : (raw || `Ошибка ${r.status}`).replace(/<[^>]*>/g, "").trim().slice(0, 200));
        throw new Error(text);
      }
      setMsg({ id, text: data.summary || "Готово", ok: true });
      load();
    } catch (e: any) {
      setMsg({ id, text: e.message || "Не удалось запустить агента", ok: false });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle
        eyebrow="Команда помощников"
        title="Агенты"
        action={<Button variant="soft" onClick={syncDrive} disabled={syncing}><RefreshCw size={15} className={syncing ? "animate-spin" : ""} /> {syncing ? "Синхронизирую…" : "Sync to Second Brain"}</Button>}
      />

      {syncMsg && (
        <div className={`rounded-xl px-4 py-2.5 text-sm ${syncMsg.ok ? "bg-sage-soft/60 text-ink/80" : "bg-rose-soft text-rose"}`}>{syncMsg.text}</div>
      )}

      {!anthropicReady && (
        <div className="rounded-xl bg-butter-soft px-4 py-3 text-sm text-ink/70">
          Чтобы запускать агентов прямо здесь, добавьте <code className="rounded bg-ink/5 px-1.5 py-0.5">ANTHROPIC_API_KEY</code> в переменные окружения.
          Внешние агенты (n8n / cron / скрипт на Mac) могут работать и без него — они присылают результат через webhook.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {agents.map((a) => {
          const Icon = ICONS[a.id] ?? Briefcase;
          const last = lastRuns[a.id];
          const isRunning = running === a.id;
          return (
            <Card key={a.id} className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-iris-soft text-iris-deep"><Icon size={16} /></span>
                {a.runnable
                  ? <Badge className="bg-sage-soft text-sage">на сервере</Badge>
                  : <Badge className="bg-line text-soft"><Webhook size={11} className="mr-1 inline" />через webhook</Badge>}
              </div>
              <div className="font-display text-base font-semibold">{a.name}</div>
              <p className="text-sm leading-relaxed text-soft">{a.desc}</p>

              {msg?.id === a.id && (
                <div className={`rounded-lg px-2.5 py-1.5 text-xs ${msg.ok ? "bg-sage-soft text-sage" : "bg-rose-soft text-rose"}`}>{msg.text}</div>
              )}

              <div className="mt-auto flex items-center justify-between border-t border-line/70 pt-2.5">
                <div className="flex items-center gap-1.5 text-xs text-soft/70">
                  {last?.status === "ok" && <CheckCircle2 size={13} className="text-sage" />}
                  {last?.status === "error" && <AlertCircle size={13} className="text-rose" />}
                  {last?.status === "running" && <Loader2 size={13} className="animate-spin" />}
                  <span>{last ? ruTime(last.created_at) : "ещё не запускался"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {last?.report && (
                    <button onClick={() => setReportOf(last)} className="text-xs text-iris hover:text-iris-deep">отчёт</button>
                  )}
                  {a.runnable && (
                    <Button variant="soft" onClick={() => run(a.id)} disabled={isRunning || !anthropicReady} className="px-2.5 py-1 text-xs">
                      {isRunning ? <Loader2 size={13} className="animate-spin" /> : <><Play size={12} className="mr-1" />Запустить</>}
                    </Button>
                  )}
                </div>
              </div>
              {last?.error && <p className="text-[11px] text-rose">Последняя ошибка: {last.error}</p>}
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-soft/70">
        Внешние агенты присылают результат на <code className="rounded bg-ink/5 px-1 py-0.5">/api/agents/&lt;id&gt;/report</code> с заголовком
        <code className="rounded bg-ink/5 px-1 py-0.5">x-agent-secret</code>. Инструкции по подключению — в README.
      </p>

      <AnimatePresence>
        {reportOf && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-3 backdrop-blur-sm sm:items-center"
            onClick={() => setReportOf(null)}
          >
            <motion.div
              initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 28, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl"
            >
              <div className="flex items-center justify-between border-b border-line p-4">
                <div>
                  <h2 className="font-display text-lg">Отчёт агента</h2>
                  <p className="text-xs text-soft/70">{reportOf.summary} · {ruTime(reportOf.created_at)}</p>
                </div>
                <button onClick={() => setReportOf(null)} className="rounded-full p-1.5 text-soft hover:bg-ink/5"><X size={18} /></button>
              </div>
              <div className="overflow-y-auto p-4">
                <pre className="whitespace-pre-wrap break-words rounded-xl bg-ink/5 p-3 text-xs leading-relaxed">{JSON.stringify(reportOf.report, null, 2)}</pre>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
