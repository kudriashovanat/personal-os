import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AGENTS, anthropicConfigured } from "@/lib/agents";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  // Последний запуск по каждому агенту
  const lastRuns: Record<string, any> = {};
  try {
    const { data } = await getSupabase()
      .from("agent_runs").select("*").order("created_at", { ascending: false }).limit(200);
    for (const run of data ?? []) if (!lastRuns[run.agent]) lastRuns[run.agent] = run;
  } catch { /* Supabase не настроен */ }
  return NextResponse.json({
    agents: AGENTS,
    lastRuns,
    anthropicReady: anthropicConfigured(),
  });
}
