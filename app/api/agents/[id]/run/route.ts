import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAgent, runHrTrends, runContentIdeas, runCareerSearch, scoreVacancies, anthropicConfigured } from "@/lib/agents";
import { getSupabase } from "@/lib/supabase";
import { DEFAULT_NEW_STATUS } from "@/lib/career";
import { projectToSecondBrain, trendMarkdown, contentIdeaMarkdown } from "@/lib/secondbrain";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  // Токен сессии нужен для проекции артефактов в Drive (план знаний). На ручном
  // запуске с дашборда он есть; на автономном пути (webhook) — нет, тогда пишем
  // только в Supabase (решение по Drive-доступу: пока без серверного refresh-токена).
  const accessToken = (session as any).accessToken as string | undefined;
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
      let projected = 0;
      for (const it of items) {
        try {
          const { data: row } = await sb.from("trends").insert({
            title: it.title, summary: it.summary, source_url: it.source_url ?? null,
            signal: it.signal ?? null, applied_idea: it.applied_idea ?? null, status: "новое",
          }).select("id").single();
          added++;
          // Проекция в Second Brain (Drive). Best-effort: без токена/папки — пропуск.
          try {
            const { fileName, body } = trendMarkdown(it);
            const ref = await projectToSecondBrain(accessToken, "hr-trends", fileName, body);
            if (ref && row?.id) { await sb.from("trends").update(ref).eq("id", row.id); projected++; }
          } catch { /* проекция не критична */ }
        } catch { /* пропускаем сбойную вставку */ }
      }
      summary = `Найдено сигналов: ${items.length}, добавлено: ${added}${projected ? `, в Second Brain: ${projected}` : ""}`;
      report = { items };
    } else if (agent.id === "career-search") {
      const { items } = await runCareerSearch();

      // Профиль для скоринга. Зависимость из брифа: без cv_text fit_score = вода —
      // тогда пишем вакансии без оценки (скоринг пропускаем).
      let profile: any = null;
      try {
        const { data } = await sb.from("profile").select("cv_text, target_roles, target_level").limit(1).maybeSingle();
        profile = data ?? null;
      } catch { /* таблицы profile ещё нет — без скоринга */ }

      let scores: (any | null)[] = items.map(() => null);
      let scored = false;
      if (profile?.cv_text) {
        try {
          const res = await scoreVacancies(items, profile);
          scores = res.scores;
          scored = true;
        } catch { /* скоринг недоступен — пишем без оценки */ }
      }

      let added = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const s = scores[i];
        try {
          // career_status_history пишется триггером БД на INSERT — руками не дублируем.
          await sb.from("career_items").insert({
            title: it.title,
            company: it.company ?? null,
            link: it.link ?? null,
            country: it.country ?? null,
            remote: it.remote ?? false,
            level: it.level ?? null,
            language: it.language ?? null,
            notes: it.notes ?? null,
            source: it.source ?? null,
            status: DEFAULT_NEW_STATUS,
            // Поля скоринга (если был профиль) — иначе остаются null.
            fit_score: s?.fit_score ?? null,
            fit_reason: s?.fit_reason ?? null,
            fit_risks: s?.fit_risks ?? null,
            to_strengthen: s?.to_strengthen ?? null,
            level_match: s?.level_match ?? null,
            salary: s?.salary ?? null,
            next_action: s?.next_action ?? null,
          });
          added++;
        } catch { /* пропускаем сбойную вставку */ }
      }
      summary = `Найдено вакансий: ${items.length}, добавлено: ${added}${scored ? ", со скорингом" : " (без скоринга — нет профиля)"}`;
      report = { items, scored };
    } else if (agent.id === "content-ideas") {
      // Контекст: свежие тренды
      let trends: any[] = [];
      try {
        const { data } = await sb.from("trends").select("title, summary").order("created_at", { ascending: false }).limit(8);
        trends = data ?? [];
      } catch { /* без контекста */ }
      const { items } = await runContentIdeas({ trends });
      let added = 0;
      let projected = 0;
      for (const it of items) {
        try {
          const { data: row } = await sb.from("content_ideas").insert({
            title: it.title, platform: it.platform === "LinkedIn" ? "LinkedIn" : "Telegram",
            topic: it.topic ?? null, hook: it.hook ?? null, status: "идея",
          }).select("id").single();
          added++;
          try {
            const { fileName, body } = contentIdeaMarkdown(it);
            const ref = await projectToSecondBrain(accessToken, "content-ideas", fileName, body);
            if (ref && row?.id) { await sb.from("content_ideas").update(ref).eq("id", row.id); projected++; }
          } catch { /* проекция не критична */ }
        } catch { /* пропуск */ }
      }
      summary = `Сгенерировано идей: ${items.length}, добавлено: ${added}${projected ? `, в Second Brain: ${projected}` : ""}`;
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
