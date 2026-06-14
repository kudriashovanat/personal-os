import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { createMarkdownInDrive } from "@/lib/google";

export const dynamic = "force-dynamic";

const ALLOWED = ["title", "content", "tags", "source", "status"];

function ideaMd(title: string | null, content: string, tags: string[]) {
  const fm = ["---", "type: idea", `title: ${JSON.stringify(title || "Идея")}`, `date: ${new Date().toISOString().slice(0, 10)}`,
    `tags: [${["idea", ...tags].join(", ")}]`, "---", "", title ? `# ${title}\n` : "", content, ""].join("\n");
  const slug = (title || content).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "idea";
  return { fileName: `${new Date().toISOString().slice(0, 10)}-${slug}.md`, body: fm };
}

export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    let q = getSupabase().from("inbox_items").select("*").order("created_at", { ascending: false });
    const status = req.nextUrl.searchParams.get("status");
    if (status) q = q.eq("status", status);
    const { data, error } = await q.limit(Number(req.nextUrl.searchParams.get("limit")) || 200);
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const accessToken = (session as any).accessToken as string | undefined;
  try {
    const body = await req.json();
    const content = (body.content || "").trim();
    if (!content) return NextResponse.json({ error: "Пустая идея" }, { status: 400 });
    const tags: string[] = Array.isArray(body.tags) ? body.tags : [];

    // Канон контента — Drive/Obsidian Inbox (best-effort), указатель в Supabase.
    let drive_id: string | null = null, drive_link: string | null = null;
    if (accessToken) {
      try {
        const { fileName, body: md } = ideaMd(body.title ?? null, content, tags);
        const d = await createMarkdownInDrive(accessToken, fileName, md);
        if (d.ok) { drive_id = d.file.id; drive_link = d.file.webViewLink ?? null; }
      } catch { /* проекция не критична */ }
    }

    const { data, error } = await getSupabase().from("inbox_items").insert({
      title: body.title ?? null, content, tags, source: body.source ?? "manual", status: "new", drive_id, drive_link,
    }).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const { id, ...rest } = await req.json();
    if (!id) return NextResponse.json({ error: "Нет id" }, { status: 400 });
    const patch: Record<string, any> = {};
    for (const f of ALLOWED) if (f in rest) patch[f] = rest[f];
    const { data, error } = await getSupabase().from("inbox_items").update(patch).eq("id", id).select().single();
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
    const { error } = await getSupabase().from("inbox_items").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
