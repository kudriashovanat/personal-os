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

export type InterviewAnalysisLike = {
  strengths?: string | null; weaknesses?: string | null; missed_opportunities?: string | null;
  objections?: string | null; recommendations?: string | null;
  questions?: string[] | null; dimension_scores?: Record<string, number> | null;
};
export function interviewAnalysisMarkdown(
  vac: { title: string; company?: string | null },
  roundType: string | null,
  a: InterviewAnalysisLike,
): { fileName: string; body: string } {
  const fm = yaml({ type: "interview-debrief", title: `${vac.title}${roundType ? ` · ${roundType}` : ""}`, company: vac.company ?? "", date: today(), tags: "#interview #career" });
  const dims = a.dimension_scores && Object.keys(a.dimension_scores).length
    ? "\n## Оценки по осям\n" + Object.entries(a.dimension_scores).map(([k, v]) => `- ${k}: ${v}/10`).join("\n") + "\n"
    : "";
  const qs = a.questions?.length ? "\n## Вопросы\n" + a.questions.map((q) => `- ${q}`).join("\n") + "\n" : "";
  const body = `${fm}
# Разбор интервью · ${vac.title}${roundType ? ` (${roundType})` : ""}
${a.strengths ? `\n## Сильно\n${a.strengths}\n` : ""}${a.weaknesses ? `\n## Слабо\n${a.weaknesses}\n` : ""}${a.missed_opportunities ? `\n## Упущено\n${a.missed_opportunities}\n` : ""}${a.objections ? `\n## Возражения\n${a.objections}\n` : ""}${dims}${qs}${a.recommendations ? `\n## К следующему разу\n${a.recommendations}\n` : ""}`;
  return { fileName: `${today()}-debrief-${slug(vac.title)}.md`, body };
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
