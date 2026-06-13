import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/runAgent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Защищённый автозапуск агента (Vercel Cron / внешний планировщик).
// Секрет: AGENT_CRON_SECRET (или CRON_SECRET, который Vercel сам шлёт в Authorization).
// Принимаем как `Authorization: Bearer <secret>`, так и `?secret=<secret>`.
// Автономный запуск: без сессии → Drive-проекция пропускается, пишем в Supabase.
export async function GET(req: NextRequest, { params }: { params: { agent: string } }) {
  const SECRET = process.env.AGENT_CRON_SECRET || process.env.CRON_SECRET;
  if (!SECRET) {
    return NextResponse.json({ error: "AGENT_CRON_SECRET не задан — автозапуск отключён" }, { status: 503 });
  }
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const qs = req.nextUrl.searchParams.get("secret") || "";
  if (bearer !== SECRET && qs !== SECRET) {
    return NextResponse.json({ error: "Неверный или отсутствующий секрет cron" }, { status: 401 });
  }

  try {
    const { summary, report } = await runAgent(params.agent, { trigger: "schedule" });
    return NextResponse.json({ ok: true, agent: params.agent, summary, report });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ошибка автозапуска" }, { status: 500 });
  }
}
