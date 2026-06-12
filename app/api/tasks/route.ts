import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const date = req.nextUrl.searchParams.get("date");
    let q = getSupabase().from("tasks").select("*").order("priority").order("created_at");
    if (date) q = q.or(`due_date.eq.${date},due_date.is.null`);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const body = await req.json();
    const { data, error } = await getSupabase()
      .from("tasks")
      .insert({
        title: body.title,
        category: body.category ?? "Главное",
        priority: body.priority ?? 2,
        status: "todo",
        quadrant: body.quadrant ?? null,
        due_date: body.due_date ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const { id, ...patch } = await req.json();
    const { data, error } = await getSupabase().from("tasks").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const { id } = await req.json();
    const { error } = await getSupabase().from("tasks").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
