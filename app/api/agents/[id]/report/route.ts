import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agents";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// POST /api/agents/[id]/report — webhook для ВНЕШНИХ агентов (n8n / cron / скрипт на Mac).
// Аутентификация — секрет в заголовке x-agent-secret (env AGENT_WEBHOOK_SECRET).
// Тело — ДАННЫЕ отчёта, который показывается в дашборде; как инструкции не исполняется.
// { status?: "ok"|"error", summary?: string, report?: any, error?: string }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const secret = process.env.AGENT_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "AGENT_WEBHOOK_SECRET не настроен на сервере" }, { status: 503 });
  if (req.headers.get("x-agent-secret") !== secret) return NextResponse.json({ error: "Неверный секрет" }, { status: 401 });

  const agent = getAgent(params.id);
  if (!agent) return NextResponse.json({ error: "Агент не найден" }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const status = body.status === "error" ? "error" : "ok";
    const { data, error } = await getSupabase().from("agent_runs").insert({
      agent: agent.id,
      status,
      trigger: "webhook",
      summary: typeof body.summary === "string" ? body.summary.slice(0, 1000) : null,
      report: body.report ?? null,
      error: typeof body.error === "string" ? body.error.slice(0, 2000) : null,
      finished_at: new Date().toISOString(),
    }).select("id").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
