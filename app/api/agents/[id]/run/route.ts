import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAgent, runHrTrends, runContentIdeas, runCareerSearch, anthropicConfigured } from "@/lib/agents";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const agent = getAgent(params.id);
  if (!agent) return NextResponse.json({ error: "Агент не найден" }, { status: 404 });
  if (!agent.runnable) return NextResponse.json({ error: "Этот агент запускается извне (n8n / cron / скрипт)" }, { status: 400 });
  if (!anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан — добавьте ключ, чтобы запускать агентов на сервере" }, { status: 503 });

  const sb = getSupabase();
  let runId: string | null = null;
  try {
    // Открываем запись запуска
    try {
      const { data } = await sb.from("agent_runs").insert({ agent: agent.id, status: "running", trigger: "manual" }).select("id").single();
      runId = data?.id ?? null;
    } catch { /* журнал недоступен — продолжаем без него */ }

    let summary = "";
    let report: any = {};

    if (agent.id === "hr-trends") {
      const { items } = await runHrTrends();
      // Пишем тренды (не дублируем по заголовку за последние 30 дней — простая защита)
      let added = 0;
      for (const it of items) {
        try {
          await sb.from("trends").insert({
            title: it.title, summary: it.summary, source_url: it.source_url ?? null,
            signal: it.signal ?? null, applied_idea: it.applied_idea ?? null, status: "новое",
          });
          added++;
        } catch { /* пропускаем сбойную вставку */ }
      }
      summary = `Найдено сигналов: ${items.length}, добавлено: ${added}`;
      report = { items };
    } else if (agent.id === "career-search") {
      const { items } = await runCareerSearch();
      let added = 0;
      for (const it of items) {
        try {
          await sb.from("career_items").insert({
            title: it.title,
            company: it.company ?? null,
            link: it.link ?? null,
            country: it.country ?? null,
            remote: it.remote ?? false,
            level: it.level ?? null,
            language: it.language ?? null,
            notes: it.notes ?? null,
            status: "посмотреть",
          });
          added++;
        } catch { /* пропускаем сбойную вставку */ }
      }
      summary = `Найдено вакансий: ${items.length}, добавлено в Карьеру: ${added}`;
      report = { items };
    } else if (agent.id === "content-ideas") {
      // Контекст: свежие тренды
      let trends: any[] = [];
      try {
        const { data } = await sb.from("trends").select("title, summary").order("created_at", { ascending: false }).limit(8);
        trends = data ?? [];
      } catch { /* без контекста */ }
      const { items } = await runContentIdeas({ trends });
      let added = 0;
      for (const it of items) {
        try {
          await sb.from("content_ideas").insert({
            title: it.title, platform: it.platform === "LinkedIn" ? "LinkedIn" : "Telegram",
            topic: it.topic ?? null, hook: it.hook ?? null, status: "идея",
          });
          added++;
        } catch { /* пропуск */ }
      }
      summary = `Сгенерировано идей: ${items.length}, добавлено в Контент-студию: ${added}`;
      report = { items };
    }

    if (runId) {
      try { await sb.from("agent_runs").update({ status: "ok", summary, report, finished_at: new Date().toISOString() }).eq("id", runId); } catch {}
    }
    return NextResponse.json({ ok: true, summary, report });
  } catch (e: any) {
    if (runId) {
      try { await getSupabase().from("agent_runs").update({ status: "error", error: e.message, finished_at: new Date().toISOString() }).eq("id", runId); } catch {}
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
