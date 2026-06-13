import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Раунды интервью по вакансии (одна вакансия → много раундов). К каждому раунду
// подтягивается последний разбор (interview_analyses).
export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const itemId = req.nextUrl.searchParams.get("career_item_id");
  if (!itemId) return NextResponse.json({ error: "Нет career_item_id" }, { status: 400 });
  try {
    const sb = getSupabase();
    const { data: rounds, error } = await sb
      .from("interviews")
      .select("id, career_item_id, round_type, scheduled_at, transcript, created_at")
      .eq("career_item_id", itemId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const ids = (rounds ?? []).map((r) => r.id);
    let analyses: any[] = [];
    if (ids.length) {
      const { data } = await sb.from("interview_analyses").select("*").in("interview_id", ids).order("created_at", { ascending: false });
      analyses = data ?? [];
    }
    const latestByRound = new Map<string, any>();
    for (const a of analyses) if (!latestByRound.has(a.interview_id)) latestByRound.set(a.interview_id, a);

    const result = (rounds ?? []).map((r) => ({ ...r, analysis: latestByRound.get(r.id) ?? null }));
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const { career_item_id, round_type, scheduled_at, transcript } = await req.json();
    if (!career_item_id) return NextResponse.json({ error: "Нет career_item_id" }, { status: 400 });
    const { data, error } = await getSupabase()
      .from("interviews")
      .insert({ career_item_id, round_type: round_type ?? null, scheduled_at: scheduled_at || null, transcript: transcript ?? null })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ...data, analysis: null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const { id, ...patch } = await req.json();
    if (!id) return NextResponse.json({ error: "Нет id" }, { status: 400 });
    const allowed: Record<string, any> = {};
    for (const f of ["round_type", "scheduled_at", "transcript"]) if (f in patch) allowed[f] = patch[f] || null;
    const { data, error } = await getSupabase().from("interviews").update(allowed).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Нет id" }, { status: 400 });
    const { error } = await getSupabase().from("interviews").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
