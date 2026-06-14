import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listCalendarEvents, createCalendarEvent } from "@/lib/google";

export const dynamic = "force-dynamic";

// Создание встречи (по явному действию пользователя — форма + кнопка).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "Нет токена Google. Выйдите и войдите снова." }, { status: 401 });
  try {
    const { title, start, end, allDay, location } = await req.json();
    if (!title?.trim() || !start || !end) return NextResponse.json({ error: "Нужны название и время" }, { status: 400 });
    const ev = await createCalendarEvent(accessToken, { title: title.trim(), start, end, allDay, location });
    return NextResponse.json(ev);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

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
