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

// Создание markdown-файла в папке Drive (Inbox вашего Obsidian Vault)
export async function createMarkdownInDrive(accessToken: string, fileName: string, content: string) {
  const folderId = process.env.OBSIDIAN_INBOX_FOLDER_ID;
  if (!folderId) return { ok: false as const, reason: "OBSIDIAN_INBOX_FOLDER_ID не задан" };

  const metadata = {
    name: fileName,
    parents: [folderId],
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
