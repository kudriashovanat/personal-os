import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Foundation-сущность: профиль пользователя (синглтон). Используется скорингом и
// Calibrator. Доступ только через service-role на сервере.
const FIELDS = ["display_name", "first_name", "cv_text", "experience", "achievements", "languages", "location", "target_roles", "target_level"] as const;

export async function GET() {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const { data, error } = await getSupabase().from("profile").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw error;
    return NextResponse.json(data ?? null);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT — upsert синглтона: обновляем существующую строку или создаём первую.
export async function PUT(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const body = await req.json();
    const patch: Record<string, any> = {};
    for (const f of FIELDS) if (f in body) patch[f] = body[f];
    patch.updated_at = new Date().toISOString();

    const sb = getSupabase();
    const { data: existing } = await sb.from("profile").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();

    const q = existing?.id
      ? sb.from("profile").update(patch).eq("id", existing.id).select().single()
      : sb.from("profile").insert(patch).select().single();
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
