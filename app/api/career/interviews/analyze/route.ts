import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { analyzeInterview, anthropicConfigured } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Разбор одного раунда по его транскрипту → строка в interview_analyses.
export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  if (!anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан" }, { status: 503 });
  try {
    const { interview_id } = await req.json();
    if (!interview_id) return NextResponse.json({ error: "Нет interview_id" }, { status: 400 });

    const sb = getSupabase();
    const { data: round, error } = await sb.from("interviews").select("id, career_item_id, transcript").eq("id", interview_id).single();
    if (error || !round) return NextResponse.json({ error: "Раунд не найден" }, { status: 404 });
    if (!round.transcript || round.transcript.trim().length < 50) {
      return NextResponse.json({ error: "Вставьте транскрипт раунда (минимум пара реплик)." }, { status: 412 });
    }

    const { data: vac } = await sb.from("career_items").select("title, company, level, country").eq("id", round.career_item_id).single();
    const { data: profile } = await sb.from("profile").select("cv_text, target_roles, target_level").limit(1).maybeSingle();

    const { data: analysis, modelText } = await analyzeInterview(round.transcript, vac ?? { title: "—" }, profile ?? {});

    const { data: saved, error: e2 } = await sb
      .from("interview_analyses")
      .insert({
        interview_id,
        questions: analysis.questions,
        competency_map: analysis.competency_map,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        missed_opportunities: analysis.missed_opportunities,
        objections: analysis.objections,
        dimension_scores: analysis.dimension_scores,
        recommendations: analysis.recommendations,
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      })
      .select()
      .single();
    if (e2) throw e2;
    void modelText;
    return NextResponse.json(saved);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
