import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildGraph } from "@/lib/graph";
import { DriveError } from "@/lib/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/graph?refresh=1 — граф знаний из заметок Drive (кэш 5 минут)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const token = (session as any).accessToken as string | undefined;
  if (!token) return NextResponse.json({ error: "Google-сессия истекла — выйдите и войдите заново" }, { status: 401 });
  try {
    const force = req.nextUrl.searchParams.get("refresh") === "1";
    const graph = await buildGraph(token, force);
    return NextResponse.json(graph);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof DriveError ? e.status : 500 });
  }
}
