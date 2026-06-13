import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { computeAnalytics, type ItemRow, type HistoryRow } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// Считает activity-аналитику из career_items + career_status_history.
// Толерантно к отсутствию таблицы истории (до миграции) — тогда метрики по
// откликам/дням и остыванию будут пустыми, но страница не падает.
export async function GET() {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const sb = getSupabase();
  try {
    const { data: items, error: e1 } = await sb
      .from("career_items")
      .select("id, title, company, status, level_match, fit_score, country, source, created_at, next_action, next_action_date");
    if (e1) throw e1;

    let history: HistoryRow[] = [];
    try {
      const { data } = await sb.from("career_status_history").select("career_item_id, from_status, to_status, changed_at");
      history = (data as HistoryRow[]) ?? [];
    } catch { /* таблицы ещё нет */ }

    const analytics = computeAnalytics((items as ItemRow[]) ?? [], history);
    return NextResponse.json(analytics);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
