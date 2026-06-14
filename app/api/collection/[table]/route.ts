import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// Универсальный CRUD для простых коллекций. Только белый список таблиц.
const ALLOWED = new Set(["content_ideas", "career_items", "goals", "contacts", "task_filters"]);

function check(table: string) {
  if (!ALLOWED.has(table)) throw new Error("Таблица недоступна");
}

export async function GET(_req: NextRequest, { params }: { params: { table: string } }) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    check(params.table);
    const { data, error } = await getSupabase().from(params.table).select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { table: string } }) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    check(params.table);
    const body = await req.json();
    const { data, error } = await getSupabase().from(params.table).insert(body).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { table: string } }) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    check(params.table);
    const { id, ...patch } = await req.json();
    const { data, error } = await getSupabase().from(params.table).update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { table: string } }) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    check(params.table);
    const { id } = await req.json();
    const { error } = await getSupabase().from(params.table).delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
