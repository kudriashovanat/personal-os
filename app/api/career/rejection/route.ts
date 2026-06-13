import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { classifyRejection, anthropicConfigured } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET последний отказ по вакансии.
export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const itemId = req.nextUrl.searchParams.get("career_item_id");
  if (!itemId) return NextResponse.json({ error: "Нет career_item_id" }, { status: 400 });
  try {
    const { data } = await getSupabase()
      .from("rejections").select("*").eq("career_item_id", itemId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return NextResponse.json(data ?? null);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: классифицировать вставленный текст отказа и сохранить.
export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  if (!anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан" }, { status: 503 });
  try {
    const { id, raw_text, notes } = await req.json();
    if (!id || !raw_text?.trim()) return NextResponse.json({ error: "Нужны id и текст отказа" }, { status: 400 });

    const sb = getSupabase();
    const { data: vac } = await sb.from("career_items").select("title, company, level").eq("id", id).single();
    const { data: profile } = await sb.from("profile").select("cv_text, target_roles, target_level").limit(1).maybeSingle();

    const { data: classification } = await classifyRejection(raw_text, vac ?? { title: "—" }, profile ?? {});

    const { data: saved, error } = await sb
      .from("rejections")
      .insert({ career_item_id: id, raw_text, classified_reasons: classification, notes: notes ?? null })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(saved);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
