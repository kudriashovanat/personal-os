import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAgent, runHrTrends, runContentIdeas, runCareerSearch, scoreVacancies, generateLearningItems, anthropicConfigured } from "@/lib/agents";
import { getSupabase } from "@/lib/supabase";
import { DEFAULT_NEW_STATUS } from "@/lib/career";
import { projectToSecondBrain, trendMarkdown, contentIdeaMarkdown } from "@/lib/secondbrain";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // в пределах лимита Vercel; career-search сокращён под этот бюджет

// Поэтапное логирование (видно в Vercel logs) — чтобы понимать, где уходит время.
function log(agent: string, stage: string, since?: number) {
  console.log(`[${agent}] ${stage}${since ? ` +${Date.now() - since}ms` : ""}`);
}

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
      // ТОЛЬКО поиск + сохранение. Скоринг вынесен в отдельного агента career-score,
      // чтобы один запрос гарантированно укладывался в лимит времени Vercel.
      const t0 = Date.now();
      log("career-search", "search started");
      const { items } = await runCareerSearch();
      log("career-search", `search completed (${items.length} вакансий)`, t0);

      let added = 0;
      const tSave = Date.now();
      for (const it of items) {
        try {
          // career_status_history пишется триггером БД на INSERT — руками не дублируем.
          // Поля скоринга остаются null до прогона Career Scoring.
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
          });
          added++;
        } catch { /* пропускаем сбойную вставку */ }
      }
      log("career-search", `save completed (${added})`, tSave);
      summary = `Найдено вакансий: ${items.length}, добавлено: ${added}. Запустите «Career Scoring» для fit_score.`;
      report = { items, scored: false };
    } else if (agent.id === "career-score") {
      // Фоновый скоринг: берём пачку невыставленных вакансий и считаем батчами по 5.
      const t0 = Date.now();
      const { data: profile } = await sb.from("profile").select("cv_text, target_roles, target_level").limit(1).maybeSingle();
      if (!profile?.cv_text) {
        const m = "Нет cv_text в профиле — заполните /профиль, иначе fit_score = вода.";
        if (runId) { try { await sb.from("agent_runs").update({ status: "error", error: m, finished_at: new Date().toISOString() }).eq("id", runId); } catch {} }
        return NextResponse.json({ error: m }, { status: 412 });
      }
      const { data: pending } = await sb
        .from("career_items")
        .select("id, title, company, link, country, remote, level, language, notes, source")
        .is("fit_score", null)
        .order("date_found", { ascending: false })
        .limit(15);

      const list = (pending ?? []) as any[];
      log("career-score", `scoring started (${list.length} в очереди)`, t0);

      let scoredCount = 0;
      for (let b = 0; b < list.length; b += 5) {
        const batch = list.slice(b, b + 5);
        try {
          const { scores } = await scoreVacancies(batch, profile);
          for (let i = 0; i < batch.length; i++) {
            const s = scores[i];
            if (!s) continue;
            try {
              await sb.from("career_items").update({
                fit_score: s.fit_score, fit_reason: s.fit_reason, fit_risks: s.fit_risks,
                to_strengthen: s.to_strengthen, level_match: s.level_match,
                salary: s.salary, next_action: s.next_action,
              }).eq("id", batch[i].id);
              scoredCount++;
            } catch { /* пропуск строки */ }
          }
          log("career-score", `batch ${b / 5 + 1} completed`, t0);
        } catch (err: any) {
          log("career-score", `batch ${b / 5 + 1} failed: ${(err?.message || "").slice(0, 60)}`, t0);
        }
      }
      const left = Math.max(0, list.length - scoredCount);
      summary = `Оценено вакансий: ${scoredCount}${left ? `, осталось в очереди: ${left} — запустите ещё раз` : ""}`;
      report = { scored: scoredCount, queued: list.length };
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
    } else if (agent.id === "english-coach" || agent.id === "hebrew-coach") {
      const lang: "en" | "he" = agent.id === "english-coach" ? "en" : "he";
      const PER_RUN = 5;
      // Дедуп: тянем уже известные термины этого языка.
      let existing: string[] = [];
      try {
        const { data } = await sb.from("learning_items").select("term").eq("language", lang).limit(500);
        existing = (data ?? []).map((r: any) => r.term).filter(Boolean);
      } catch { /* таблицы ещё нет */ }

      const known = new Set(existing.map((t) => t.toLowerCase()));
      const { items } = await generateLearningItems(lang, PER_RUN, existing);
      let added = 0;
      for (const it of items) {
        if (known.has(it.term.toLowerCase())) continue; // защита от гонок/дублей
        try {
          await sb.from("learning_items").insert({
            language: lang,
            term: it.term,
            translation: it.translation,
            transliteration: it.transliteration,
            part_of_speech: it.part_of_speech,
            example: it.example,
            note: it.note,
            category: it.category,
            level: it.level,
          });
          known.add(it.term.toLowerCase());
          added++;
        } catch { /* пропуск дубля/сбоя */ }
      }
      summary = `${lang === "en" ? "English" : "Иврит"}: новых карточек ${added}`;
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
