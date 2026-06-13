import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractVacancy, anthropicConfigured } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Quick-add: вставил ссылку/текст → AI извлёк поля. БД НЕ трогаем — поля
// возвращаются на фронт, пользователь подтверждает и сохраняет сам.
export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  if (!anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан" }, { status: 503 });
  try {
    const { link, text } = await req.json();
    const { data } = await extractVacancy({ link, text });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
