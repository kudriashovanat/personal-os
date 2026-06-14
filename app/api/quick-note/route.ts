import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { createMarkdownInDrive } from "@/lib/google";

// Obsidian-first: заметка сохраняется markdown-файлом в Inbox вашего Vault (через Google Drive).
// Supabase хранит копию как журнал/резерв. Источник истины — Obsidian.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const { text, type } = await req.json();
    if (!text?.trim()) return NextResponse.json({ error: "Пустая заметка" }, { status: 400 });

    const now = new Date();
    const stamp = now.toISOString().replace(/[:T]/g, "-").slice(0, 16);
    const fileName = `Inbox ${stamp}.md`;
    const md = [
      "---",
      `type: ${type ?? "Мысль"}`,
      `created: ${now.toISOString()}`,
      "source: personal-os",
      "tags: [inbox]",
      "---",
      "",
      text.trim(),
      "",
    ].join("\n");

    let savedTo = "Ideas (Supabase)";
    let drive_id: string | null = null, drive_link: string | null = null;
    const accessToken = (session as any).accessToken as string | undefined;
    if (accessToken) {
      const drive = await createMarkdownInDrive(accessToken, fileName, md);
      if (drive.ok) { savedTo = "Obsidian · Inbox"; drive_id = drive.file.id; drive_link = drive.file.webViewLink ?? null; }
    }

    // Быстрый capture попадает в Ideas/Inbox (inbox_items) — единый источник входящих.
    try {
      await getSupabase().from("inbox_items").insert({
        title: text.trim().split("\n")[0].slice(0, 80),
        content: text.trim(),
        tags: [type ?? "Мысль"],
        source: "note",
        status: "new",
        drive_id, drive_link,
      });
    } catch {
      /* Supabase может быть ещё не настроен — заметка уже в Obsidian */
    }

    return NextResponse.json({ ok: true, savedTo });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
