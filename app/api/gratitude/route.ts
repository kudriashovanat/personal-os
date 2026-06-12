import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const { data, error } = await getSupabase()
      .from("gratitude_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .limit(120);
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const body = await req.json();
    const { data, error } = await getSupabase()
      .from("gratitude_entries")
      .upsert(body, { onConflict: "entry_date" })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
