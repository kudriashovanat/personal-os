import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { debriefPattern, anthropicConfigured } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Сквозной паттерн по всем разборам интервью одной вакансии.
// Требование брифа: паттерн через НЕСКОЛЬКО раундов, не пересказ одного.
export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const itemId = req.nextUrl.searchParams.get("career_item_id");
  if (!itemId) return NextResponse.json({ error: "Нет career_item_id" }, { status: 400 });
  try {
    const sb = getSupabase();
    const { data: rounds } = await sb.from("interviews").select("id, round_type").eq("career_item_id", itemId);
    const ids = (rounds ?? []).map((r) => r.id);
    if (ids.length < 2) return NextResponse.json({ pattern: null, count: ids.length });

    const roundType = new Map((rounds ?? []).map((r) => [r.id, r.round_type]));
    const { data: analyses } = await sb
      .from("interview_analyses")
      .select("interview_id, weaknesses, missed_opportunities, objections, dimension_scores")
      .in("interview_id", ids);

    const list = (analyses ?? []).map((a) => ({
      round_type: roundType.get(a.interview_id) as string | null,
      weaknesses: a.weaknesses, missed_opportunities: a.missed_opportunities,
      objections: a.objections, dimension_scores: a.dimension_scores,
    }));
    if (list.length < 2) return NextResponse.json({ pattern: null, count: list.length });

    if (!anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан" }, { status: 503 });
    const { data } = await debriefPattern(list);
    return NextResponse.json({ pattern: data, count: list.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
