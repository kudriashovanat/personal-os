import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { detectIdeaAction, anthropicConfigured } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// AI action detector: что сделать с идеей (task | content | note | archive).
export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  if (!anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан" }, { status: 503 });
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Нет id" }, { status: 400 });
    const sb = getSupabase();
    const { data: idea, error } = await sb.from("inbox_items").select("title, content").eq("id", id).single();
    if (error || !idea) return NextResponse.json({ error: "Идея не найдена" }, { status: 404 });

    const { data } = await detectIdeaAction(idea.title, idea.content);
    try { await sb.from("inbox_items").update({ ai_action: data.action, ai_reason: data.reason }).eq("id", id); } catch {}
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
