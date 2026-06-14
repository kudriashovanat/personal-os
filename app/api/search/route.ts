import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { searchDriveMarkdown } from "@/lib/drive";

export const dynamic = "force-dynamic";

// Поиск v1 по Second Brain: keyword (ilike) по таблицам Supabase + полнотекст по
// markdown-заметкам Drive/Obsidian (включая Telegram-инбокс). Без vector search.

export type SearchType = "files" | "trends" | "content" | "career" | "interviews" | "notes" | "vault";
export type SearchHit = {
  type: SearchType;
  typeLabel: string;
  title: string;
  snippet: string;
  drive_link: string | null;
  source_url: string | null;
  created_at: string | null;
};

const LABEL: Record<SearchType, string> = {
  files: "Files", trends: "HR Trends", content: "Content Ideas", career: "Career", interviews: "Interviews", notes: "Notes", vault: "Second Brain",
};

// Безопасный паттерн для PostgREST or-фильтра (wildcard = *), без спецсимволов.
function safe(q: string) {
  return q.replace(/[,()*%:\\]/g, " ").trim();
}
function snippet(parts: (string | null | undefined)[], q: string): string {
  const text = parts.filter(Boolean).join(" · ");
  if (!text) return "";
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 160);
  const start = Math.max(0, i - 50);
  return (start ? "…" : "") + text.slice(start, start + 180);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const token = (session as any).accessToken as string | undefined;
  const sp = req.nextUrl.searchParams;
  const qRaw = (sp.get("q") || "").trim();
  if (qRaw.length < 2) return NextResponse.json({ hits: [] });
  const q = safe(qRaw);
  if (!q) return NextResponse.json({ hits: [] });
  const p = `%${q}%`; // supabase-js ilike/or использует % как wildcard

  const want = (sp.get("types") || "").split(",").filter(Boolean) as SearchType[];
  const on = (t: SearchType) => want.length === 0 || want.includes(t);
  const sb = getSupabase();
  const PER = 12;

  const tasks: Promise<SearchHit[]>[] = [];

  if (on("files")) tasks.push((async () => {
    const { data } = await sb.from("uploads").select("name, summary, drive_link, created_at").or(`name.ilike.${p},summary.ilike.${p}`).limit(PER);
    return (data ?? []).map((r: any): SearchHit => ({ type: "files", typeLabel: LABEL.files, title: r.name, snippet: snippet([r.summary], qRaw), drive_link: r.drive_link ?? null, source_url: null, created_at: r.created_at }));
  })().catch(() => []));

  if (on("trends")) tasks.push((async () => {
    const { data } = await sb.from("trends").select("title, summary, signal, applied_idea, source_url, drive_link, created_at").or(`title.ilike.${p},summary.ilike.${p},signal.ilike.${p},applied_idea.ilike.${p}`).limit(PER);
    return (data ?? []).map((r: any): SearchHit => ({ type: "trends", typeLabel: LABEL.trends, title: r.title, snippet: snippet([r.summary, r.signal], qRaw), drive_link: r.drive_link ?? null, source_url: r.source_url ?? null, created_at: r.created_at }));
  })().catch(() => []));

  if (on("content")) tasks.push((async () => {
    const { data } = await sb.from("content_ideas").select("title, topic, hook, drive_link, created_at").or(`title.ilike.${p},topic.ilike.${p},hook.ilike.${p}`).limit(PER);
    return (data ?? []).map((r: any): SearchHit => ({ type: "content", typeLabel: LABEL.content, title: r.title, snippet: snippet([r.topic, r.hook], qRaw), drive_link: r.drive_link ?? null, source_url: null, created_at: r.created_at }));
  })().catch(() => []));

  if (on("career")) tasks.push((async () => {
    const { data } = await sb.from("career_items").select("title, company, notes, fit_reason, fit_risks, link, created_at").or(`title.ilike.${p},company.ilike.${p},notes.ilike.${p},fit_reason.ilike.${p},fit_risks.ilike.${p}`).limit(PER);
    return (data ?? []).map((r: any): SearchHit => ({ type: "career", typeLabel: LABEL.career, title: `${r.title}${r.company ? " · " + r.company : ""}`, snippet: snippet([r.fit_reason, r.notes], qRaw), drive_link: null, source_url: r.link ?? null, created_at: r.created_at }));
  })().catch(() => []));

  if (on("interviews")) tasks.push((async () => {
    const { data } = await sb.from("interview_analyses")
      .select("strengths, weaknesses, recommendations, missed_opportunities, created_at, interviews(round_type, career_items(title, company))")
      .or(`strengths.ilike.${p},weaknesses.ilike.${p},recommendations.ilike.${p},missed_opportunities.ilike.${p}`).limit(PER);
    return (data ?? []).map((r: any): SearchHit => {
      const ci = r.interviews?.career_items;
      const title = `Интервью${ci?.title ? " · " + ci.title : ""}${r.interviews?.round_type ? " (" + r.interviews.round_type + ")" : ""}`;
      return { type: "interviews", typeLabel: LABEL.interviews, title, snippet: snippet([r.weaknesses, r.recommendations], qRaw), drive_link: null, source_url: null, created_at: r.created_at };
    });
  })().catch(() => []));

  if (on("notes")) tasks.push((async () => {
    const { data } = await sb.from("inbox_items").select("title, content, drive_link, created_at").or(`title.ilike.${p},content.ilike.${p}`).limit(PER);
    return (data ?? []).map((r: any): SearchHit => ({ type: "notes", typeLabel: LABEL.notes, title: r.title || "Идея", snippet: snippet([r.content], qRaw), drive_link: r.drive_link ?? null, source_url: null, created_at: r.created_at }));
  })().catch(() => []));

  // Second Brain: полнотекст по markdown-заметкам Drive/Obsidian (включая Telegram-инбокс).
  if (on("vault") && token) tasks.push((async () => {
    const vh = await searchDriveMarkdown(token, qRaw, PER);
    return vh.map((h): SearchHit => ({
      type: "vault", typeLabel: LABEL.vault, title: h.title,
      snippet: h.snippet || "", drive_link: h.webViewLink ?? null, source_url: null,
      created_at: h.mtime ? new Date(h.mtime).toISOString() : null,
    }));
  })().catch(() => []));

  try {
    const groups = await Promise.all(tasks);
    const hits = groups.flat().sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return NextResponse.json({ hits, count: hits.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
