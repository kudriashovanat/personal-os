import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { computeNextReview, type Grade, type Lang } from "@/lib/learning";

export const dynamic = "force-dynamic";

function todayISO() { return new Date().toISOString().slice(0, 10); }

export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const sb = getSupabase();
  try {
    // Слова дня: по одной карточке на язык (приоритет — просроченная на повтор, иначе свежая).
    if (sp.get("wotd")) {
      const pick = async (lang: Lang) => {
        const due = await sb.from("learning_items").select("*").eq("language", lang).lte("due_date", todayISO()).order("due_date", { ascending: true }).limit(1).maybeSingle();
        if (due.data) return due.data;
        const fresh = await sb.from("learning_items").select("*").eq("language", lang).order("created_at", { ascending: false }).limit(1).maybeSingle();
        return fresh.data ?? null;
      };
      const [en, he] = await Promise.all([pick("en"), pick("he")]);
      return NextResponse.json({ en, he });
    }

    let q = sb.from("learning_items").select("*");
    const lang = sp.get("language");
    if (lang) q = q.eq("language", lang);
    if (sp.get("due")) q = q.lte("due_date", todayISO());
    q = sp.get("due")
      ? q.order("due_date", { ascending: true })
      : q.order("created_at", { ascending: false });
    const { data, error } = await q.limit(Number(sp.get("limit")) || 300);
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH: либо ревью SRS ({id, grade}), либо обычное обновление поля.
export async function PATCH(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const body = await req.json();
    const { id, grade, ...rest } = body;
    if (!id) return NextResponse.json({ error: "Нет id" }, { status: 400 });
    const sb = getSupabase();

    if (grade === "good" || grade === "again") {
      const { data: row } = await sb.from("learning_items").select("box, reviews, lapses").eq("id", id).single();
      const upd = computeNextReview(row?.box ?? 0, grade as Grade, todayISO());
      const { data, error } = await sb.from("learning_items").update({
        box: upd.box,
        due_date: upd.due_date,
        reviews: (row?.reviews ?? 0) + upd.reviewsInc,
        lapses: (row?.lapses ?? 0) + upd.lapsesInc,
        last_reviewed: new Date().toISOString(),
      }).eq("id", id).select().single();
      if (error) throw error;
      return NextResponse.json(data);
    }

    const { data, error } = await sb.from("learning_items").update(rest).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const { id } = await req.json();
    const { error } = await getSupabase().from("learning_items").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
