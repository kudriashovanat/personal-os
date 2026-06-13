import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { projectToSecondBrain, trendMarkdown, contentIdeaMarkdown, interviewAnalysisMarkdown } from "@/lib/secondbrain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sync to Second Brain: проецирует в Drive записи, созданные автономно (cron),
// у которых ещё нет drive_id. Использует ТЕКУЩУЮ сессию Google (без refresh-токена в БД).
// Запускается вручную пользователем → токен сессии есть.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "Google-сессия истекла — выйдите и войдите снова." }, { status: 401 });

  const sb = getSupabase();
  // Лимиты на один прогон, чтобы уложиться в время функции; кнопку можно нажать повторно.
  const LIM = { trends: 12, content: 12, interviews: 8 };
  const result = { trends: 0, content: 0, interviews: 0, remaining: 0 };

  try {
    // HR Trends
    const { data: trends } = await sb.from("trends").select("*").is("drive_id", null).order("created_at", { ascending: false }).limit(LIM.trends + 1);
    for (const t of (trends ?? []).slice(0, LIM.trends)) {
      try {
        const { fileName, body } = trendMarkdown(t);
        const ref = await projectToSecondBrain(accessToken, "hr-trends", fileName, body);
        if (ref) { await sb.from("trends").update(ref).eq("id", t.id); result.trends++; }
      } catch { /* пропуск */ }
    }
    if ((trends ?? []).length > LIM.trends) result.remaining++;

    // Content Ideas
    const { data: content } = await sb.from("content_ideas").select("*").is("drive_id", null).order("created_at", { ascending: false }).limit(LIM.content + 1);
    for (const c of (content ?? []).slice(0, LIM.content)) {
      try {
        const { fileName, body } = contentIdeaMarkdown(c);
        const ref = await projectToSecondBrain(accessToken, "content-ideas", fileName, body);
        if (ref) { await sb.from("content_ideas").update(ref).eq("id", c.id); result.content++; }
      } catch { /* пропуск */ }
    }
    if ((content ?? []).length > LIM.content) result.remaining++;

    // Interview Debriefs
    try {
      const { data: analyses } = await sb
        .from("interview_analyses")
        .select("id, strengths, weaknesses, missed_opportunities, objections, recommendations, questions, dimension_scores, interviews(round_type, career_items(title, company))")
        .is("drive_id", null).order("created_at", { ascending: false }).limit(LIM.interviews + 1);
      for (const a of (analyses ?? []).slice(0, LIM.interviews)) {
        try {
          const ci: any = (a as any).interviews?.career_items;
          const vac = { title: ci?.title || "Интервью", company: ci?.company ?? null };
          const { fileName, body } = interviewAnalysisMarkdown(vac, (a as any).interviews?.round_type ?? null, a as any);
          const ref = await projectToSecondBrain(accessToken, "career", fileName, body);
          if (ref) { await sb.from("interview_analyses").update(ref).eq("id", a.id); result.interviews++; }
        } catch { /* пропуск */ }
      }
      if ((analyses ?? []).length > LIM.interviews) result.remaining++;
    } catch { /* таблицы/колонки ещё нет */ }

    const total = result.trends + result.content + result.interviews;
    const summary = total
      ? `Синхронизировано в Second Brain: тренды ${result.trends}, идеи ${result.content}, разборы ${result.interviews}${result.remaining ? " · остались ещё — нажмите снова" : ""}`
      : "Нечего синхронизировать — всё уже в Second Brain (или папки SB_* не заданы).";
    return NextResponse.json({ ok: true, summary, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ошибка синхронизации" }, { status: 500 });
  }
}
