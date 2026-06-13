import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { calibratePositioning, anthropicConfigured } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Positioning Calibrator: советует, как позиционироваться под вакансию ДО отклика.
// Требует профиль с cv_text — иначе совет = вода.
export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  if (!anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан" }, { status: 503 });
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Нет id" }, { status: 400 });

    const sb = getSupabase();
    const { data: vac, error } = await sb.from("career_items").select("title, company, level, notes, country").eq("id", id).single();
    if (error || !vac) return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });

    const { data: profile } = await sb.from("profile").select("cv_text, target_roles, target_level").limit(1).maybeSingle();
    if (!profile?.cv_text) {
      return NextResponse.json({ error: "Сначала заполните CV в Профиле — без него калибровка бессмысленна." }, { status: 412 });
    }

    const { data } = await calibratePositioning(vac, profile);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
