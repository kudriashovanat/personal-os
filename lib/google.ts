// Работа с Google APIs через REST (без тяжёлых SDK).
// Принцип Obsidian-first: быстрые заметки пишутся markdown-файлами
// в папку Inbox вашего Obsidian Vault, синхронизированного с Google Drive.

export async function listCalendarEvents(accessToken: string, timeMin: string, timeMax: string) {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "50");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Calendar API: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.items ?? []).map((e: any) => ({
    id: e.id,
    title: e.summary ?? "(без названия)",
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    allDay: !e.start?.dateTime,
    location: e.location ?? null,
    link: e.htmlLink ?? null,
  }));
}

// Папки Second Brain в Drive (канон для знаний). По одному env-id на домен.
export type SecondBrainFolder = "hr-trends" | "content-ideas" | "career";
export function secondBrainFolderId(name: SecondBrainFolder): string | null {
  const map: Record<SecondBrainFolder, string | undefined> = {
    "hr-trends": process.env.SB_HR_TRENDS_FOLDER_ID,
    "content-ideas": process.env.SB_CONTENT_FOLDER_ID,
    "career": process.env.SB_CAREER_FOLDER_ID,
  };
  return map[name] || null;
}

// Создание markdown-файла в папке Drive. По умолчанию — Inbox вашего Obsidian Vault;
// folderId позволяет писать в доменную папку Second Brain.
export async function createMarkdownInDrive(accessToken: string, fileName: string, content: string, folderId?: string) {
  const target = folderId || process.env.OBSIDIAN_INBOX_FOLDER_ID;
  if (!target) return { ok: false as const, reason: "Папка Drive не задана (OBSIDIAN_INBOX_FOLDER_ID / SB_*_FOLDER_ID)" };

  const metadata = {
    name: fileName,
    parents: [target],
    mimeType: "text/markdown",
  };
  const boundary = "personal_os_" + Date.now();
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n` +
    content +
    `\r\n--${boundary}--`;

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) return { ok: false as const, reason: `Drive API: ${res.status} ${await res.text()}` };
  const file = await res.json();
  return { ok: true as const, file };
}

// Папка «Personal OS Uploads» в Drive для загруженных файлов.
export function uploadsFolderId(): string | null {
  return process.env.UPLOADS_FOLDER_ID || null;
}

// Загрузка БИНАРНОГО файла в Drive (multipart). Для файлов до ~5MB; больше — нужен
// resumable upload (отдельный шаг). Использует токен сессии пользователя.
export async function uploadFileToDrive(
  accessToken: string,
  name: string,
  mime: string,
  bytes: Uint8Array,
  folderId?: string,
) {
  const target = folderId || process.env.UPLOADS_FOLDER_ID;
  if (!target) return { ok: false as const, reason: "UPLOADS_FOLDER_ID не задан" };

  const contentType = mime || "application/octet-stream";
  const boundary = "po_file_" + Date.now();
  const metadata = { name, parents: [target], mimeType: contentType };
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(pre, "utf8"), Buffer.from(bytes), Buffer.from(post, "utf8")]);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) return { ok: false as const, reason: `Drive API: ${res.status} ${await res.text()}` };
  const file = await res.json();
  return { ok: true as const, file };
}
