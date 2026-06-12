import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listCalendarEvents } from "@/lib/google";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "Нет токена Google. Выйдите и войдите снова." }, { status: 401 });
  try {
    const days = Number(req.nextUrl.searchParams.get("days") ?? 7);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    const events = await listCalendarEvents(accessToken, start.toISOString(), end.toISOString());
    return NextResponse.json(events);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
