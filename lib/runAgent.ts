// lib/runAgent.ts — единая логика прогона серверного агента.
// Зовётся и из ручного роута (/api/agents/[id]/run, с токеном сессии для Drive),
// и из cron (/api/cron/[agent], без сессии — Drive-проекция тихо пропускается).
// Никакой дубликации: вся ветвистая логика живёт здесь.

import { getAgent, runHrTrends, runContentIdeas, runCareerSearch, scoreVacancies, generateLearningItems, anthropicConfigured } from "@/lib/agents";
import { getSupabase } from "@/lib/supabase";
import { DEFAULT_NEW_STATUS } from "@/lib/career";
import { projectToSecondBrain, trendMarkdown, contentIdeaMarkdown } from "@/lib/secondbrain";

export type RunTrigger = "manual" | "schedule" | "webhook";
export type RunOpts = { accessToken?: string; trigger: RunTrigger };

function log(agent: string, stage: string, since?: number) {
  console.log(`[${agent}] ${stage}${since ? ` +${Date.now() - since}ms` : ""}`);
}

/** Прогоняет агента. Возвращает {summary, report} или бросает Error с понятным сообщением. */
export async function runAgent(agentId: string, opts: RunOpts): Promise<{ summary: string; report: any }> {
  const agent = getAgent(agentId);
  if (!agent) throw new Error("Агент не найден");
  if (!agent.runnable) throw new Error("Этот агент запускается извне (n8n / cron / скрипт)");
  if (!anthropicConfigured()) throw new Error("ANTHROPIC_API_KEY не задан");

  const accessToken = opts.accessToken;
  const sb = getSupabase();
  let runId: string | null = null;
  try {
    const { data } = await sb.from("agent_runs").insert({ agent: agent.id, status: "running", trigger: opts.trigger }).select("id").single();
    runId = data?.id ?? null;
  } catch { /* журнал недоступен — продолжаем */ }

  try {
    let summary = "";
    let report: any = {};

    if (agent.id === "hr-trends") {
      const { items } = await runHrTrends();
      let added = 0;
      let projected = 0;
      for (const it of items) {
        try {
          const { data: row } = await sb.from("trends").insert({
            title: it.title, summary: it.summary, source_url: it.source_url ?? null,
            signal: it.signal ?? null, applied_idea: it.applied_idea ?? null, status: "новое",
          }).select("id").single();
          added++;
          try {
            const { fileName, body } = trendMarkdown(it);
            const ref = await projectToSecondBrain(accessToken, "hr-trends", fileName, body);
            if (ref && row?.id) { await sb.from("trends").update(ref).eq("id", row.id); projected++; }
          } catch { /* проекция не критична */ }
        } catch { /* пропуск */ }
      }
      summary = `Найдено сигналов: ${items.length}, добавлено: ${added}${projected ? `, в Second Brain: ${projected}` : ""}`;
      report = { items };
    } else if (agent.id === "career-search") {
      const t0 = Date.now();
      log("career-search", "search started");
      const { items } = await runCareerSearch();
      log("career-search", `search completed (${items.length} вакансий)`, t0);
      let added = 0;
      const tSave = Date.now();
      for (const it of items) {
        try {
          await sb.from("career_items").insert({
            title: it.title, company: it.company ?? null, link: it.link ?? null,
            country: it.country ?? null, remote: it.remote ?? false, level: it.level ?? null,
            language: it.language ?? null, notes: it.notes ?? null, source: it.source ?? null,
            status: DEFAULT_NEW_STATUS,
          });
          added++;
        } catch { /* пропуск */ }
      }
      log("career-search", `save completed (${added})`, tSave);
      summary = `Найдено вакансий: ${items.length}, добавлено: ${added}. Запустите «Career Scoring» для fit_score.`;
      report = { items, scored: false };
    } else if (agent.id === "career-score") {
      const t0 = Date.now();
      const { data: profile } = await sb.from("profile").select("cv_text, target_roles, target_level").limit(1).maybeSingle();
      if (!profile?.cv_text) throw new Error("Нет cv_text в профиле — заполните /профиль, иначе fit_score = вода.");
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
      let existing: string[] = [];
      try {
        const { data } = await sb.from("learning_items").select("term").eq("language", lang).limit(500);
        existing = (data ?? []).map((r: any) => r.term).filter(Boolean);
      } catch { /* таблицы ещё нет */ }
      const known = new Set(existing.map((t) => t.toLowerCase()));
      const { items } = await generateLearningItems(lang, 5, existing);
      let added = 0;
      for (const it of items) {
        if (known.has(it.term.toLowerCase())) continue;
        try {
          await sb.from("learning_items").insert({
            language: lang, term: it.term, translation: it.translation, transliteration: it.transliteration,
            part_of_speech: it.part_of_speech, example: it.example, note: it.note, category: it.category, level: it.level,
          });
          known.add(it.term.toLowerCase());
          added++;
        } catch { /* пропуск */ }
      }
      summary = `${lang === "en" ? "English" : "Иврит"}: новых карточек ${added}`;
      report = { items };
    } else {
      throw new Error("Для этого агента нет серверной реализации");
    }

    if (runId) {
      try { await sb.from("agent_runs").update({ status: "ok", summary, report, finished_at: new Date().toISOString() }).eq("id", runId); } catch {}
    }
    return { summary, report };
  } catch (e: any) {
    if (runId) {
      try { await getSupabase().from("agent_runs").update({ status: "error", error: e.message, finished_at: new Date().toISOString() }).eq("id", runId); } catch {}
    }
    throw e;
  }
}
