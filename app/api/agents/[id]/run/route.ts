import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runAgent } from "@/lib/runAgent";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // в пределах лимита Vercel; career-search сокращён под этот бюджет

// Ручной запуск с дашборда. Токен сессии передаём в runAgent для проекции в Drive.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const accessToken = (session as any).accessToken as string | undefined;
  try {
    const { summary, report } = await runAgent(params.id, { accessToken, trigger: "manual" });
    return NextResponse.json({ ok: true, summary, report });
  } catch (e: any) {
    const msg = e?.message || "Ошибка запуска агента";
    const status = msg.includes("не найден") ? 404 : msg.includes("извне") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
