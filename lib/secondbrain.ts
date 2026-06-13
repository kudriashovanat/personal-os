// lib/secondbrain.ts — проекция результатов в Second Brain (Drive) как markdown.
// План знаний канонично живёт в Obsidian/Drive; Supabase хранит состояние + drive_id.
// Best-effort: без токена/папки тихо пропускаем (Supabase продолжает работать).

import { createMarkdownInDrive, secondBrainFolderId, type SecondBrainFolder } from "@/lib/google";

function slug(s: string): string {
  return (s || "note").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "note";
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function yaml(obj: Record<string, string | null | undefined>): string {
  const esc = (v: string) => (/[:#\n]/.test(v) ? JSON.stringify(v) : v);
  const lines = Object.entries(obj)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}: ${esc(String(v))}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

export type DriveRef = { drive_id: string; drive_link: string | null } | null;

/** Универсальная проекция: пишет .md в доменную папку Second Brain. */
export async function projectToSecondBrain(
  accessToken: string | undefined,
  folder: SecondBrainFolder,
  fileName: string,
  markdown: string,
): Promise<DriveRef> {
  if (!accessToken) return null;
  const folderId = secondBrainFolderId(folder);
  if (!folderId) return null;
  const res = await createMarkdownInDrive(accessToken, fileName, markdown, folderId);
  if (!res.ok) return null;
  return { drive_id: res.file.id, drive_link: res.file.webViewLink ?? null };
}

// ---------- Сериализаторы по типам результатов ----------

export type TrendLike = { title: string; summary?: string | null; source_url?: string | null; signal?: string | null; applied_idea?: string | null };
export function trendMarkdown(t: TrendLike): { fileName: string; body: string } {
  const fm = yaml({ type: "hr-trend", title: t.title, source: t.source_url ?? "", date: today(), tags: "#hr-trend" });
  const body = `${fm}
# ${t.title}

${t.summary ?? ""}

${t.signal ? `**Почему важно:** ${t.signal}\n` : ""}${t.applied_idea ? `**Применение:** ${t.applied_idea}\n` : ""}${t.source_url ? `\n[Источник](${t.source_url})` : ""}
`;
  return { fileName: `${today()}-${slug(t.title)}.md`, body };
}

export type ContentIdeaLike = { title: string; platform?: string | null; topic?: string | null; hook?: string | null };
export function contentIdeaMarkdown(c: ContentIdeaLike): { fileName: string; body: string } {
  const fm = yaml({ type: "content-idea", title: c.title, platform: c.platform ?? "", date: today(), tags: "#content-idea" });
  const body = `${fm}
# ${c.title}

${c.platform ? `**Платформа:** ${c.platform}\n` : ""}${c.topic ? `**Тема:** ${c.topic}\n` : ""}${c.hook ? `\n> ${c.hook}\n` : ""}
`;
  return { fileName: `${today()}-${slug(c.title)}.md`, body };
}
