import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { uploadFileToDrive, createMarkdownInDrive } from "@/lib/google";
import { extractText } from "@/lib/extract";
import { summarizeText, anthropicConfigured } from "@/lib/agents";

export const runtime = "nodejs"; // нужен Node для pdf-parse / mammoth / xlsx
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024; // ~4MB — лимит тела serverless; больше нужен resumable

function fm(obj: Record<string, string>): string {
  return `---\n${Object.entries(obj).filter(([, v]) => v).map(([k, v]) => `${k}: ${/[:#]/.test(v) ? JSON.stringify(v) : v}`).join("\n")}\n---\n`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "Нет токена Google — выйдите и войдите снова." }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Файл больше 4MB — пока поддерживаются файлы до 4MB." }, { status: 413 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = file.name || "file";
    const mime = file.type || "application/octet-stream";

    // 1) Файл → Drive (Personal OS Uploads)
    const up = await uploadFileToDrive(accessToken, name, mime, bytes);
    if (!up.ok) return NextResponse.json({ error: up.reason }, { status: 502 });
    const driveLink = up.file.webViewLink ?? null;

    // 2) Извлечение текста (серверно, defensive)
    const { text, chars } = await extractText(bytes, mime, name);

    // 3) Краткое содержание
    let summary = "";
    if (chars > 0 && anthropicConfigured()) {
      try { summary = await summarizeText(text, name); } catch { /* не критично */ }
    }

    // 4) Карточка-знание в Obsidian Inbox (markdown со ссылкой + summary)
    let inboxId: string | null = null;
    try {
      const md = `${fm({ type: "file", title: name, source: driveLink ?? "", date: new Date().toISOString().slice(0, 10), tags: "#file" })}
# ${name}

${driveLink ? `[Открыть в Google Drive](${driveLink})\n` : ""}**Тип:** ${mime} · **Размер:** ${Math.round(file.size / 1024)} KB${chars ? ` · **Извлечено символов:** ${chars}` : ""}

${summary ? `## Краткое содержание\n${summary}\n` : "_Текст не извлечён или файл нетекстовый._\n"}`;
      const card = await createMarkdownInDrive(accessToken, `${new Date().toISOString().slice(0, 10)}-${name}.md`, md);
      if (card.ok) inboxId = card.file.id;
    } catch { /* карточка не критична */ }

    // 5) Индекс в Supabase
    try {
      await getSupabase().from("uploads").insert({
        name, mime, size: file.size, drive_id: up.file.id, drive_link: driveLink,
        inbox_drive_id: inboxId, summary: summary || null, extracted_chars: chars,
      });
    } catch { /* индекс не критичен */ }

    return NextResponse.json({ name, drive_link: driveLink, summary, extracted_chars: chars, inbox: Boolean(inboxId) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
