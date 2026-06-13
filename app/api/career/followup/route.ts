import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { draftFollowup, anthropicConfigured } from "@/lib/agents";
import { normalizeStatus } from "@/lib/career";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Черновик follow-up по остывшей заявке. Сообщение НЕ отправляется — только текст
// для ручной отправки (правило: внешние действия только после подтверждения).
export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  if (!anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан" }, { status: 503 });
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Нет id" }, { status: 400 });

    const { data, error } = await getSupabase()
      .from("career_items").select("title, company, recruiter_name, status").eq("id", id).single();
    if (error || !data) return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });

    const { message } = await draftFollowup({
      title: data.title,
      company: data.company,
      recruiter_name: data.recruiter_name,
      status: normalizeStatus(data.status),
    });
    return NextResponse.json({ message });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
