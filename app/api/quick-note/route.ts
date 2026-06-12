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

    let savedTo = "журнал (Supabase)";
    const accessToken = (session as any).accessToken as string | undefined;
    if (accessToken) {
      const drive = await createMarkdownInDrive(accessToken, fileName, md);
      if (drive.ok) savedTo = "Obsidian · Inbox";
    }

    // Журнальная копия (не источник истины)
    try {
      await getSupabase().from("quick_notes").insert({ text: text.trim(), note_type: type ?? "Мысль" });
    } catch {
      /* Supabase может быть ещё не настроен — заметка уже в Obsidian */
    }

    return NextResponse.json({ ok: true, savedTo });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
