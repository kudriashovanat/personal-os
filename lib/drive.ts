// lib/drive.ts — cloud-first хранилище Personal OS в Google Drive.
// Структура: папка "Personal OS" в корне Drive + подпапки разделов.
// Модуль умеет читать, искать, создавать и обновлять СВОИ файлы.
// Здесь намеренно нет функций удаления и перемещения.
// Совместимость с Obsidian: все заметки — обычные .md с frontmatter,
// папку "Personal OS" можно синхронизировать в Vault через Drive for Desktop.

const ROOT_NAME = process.env.DRIVE_ROOT_FOLDER_NAME || "Personal OS";
export const SECTION_FOLDERS = [
  "Inbox",
  "Daily",
  "Gratitude",
  "Files",
  "Telegram Sources",
  "Career",
  "Content Ideas",
] as const;
export type SectionFolder = (typeof SECTION_FOLDERS)[number];

const FOLDER_MIME = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export class DriveError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

async function gfetch(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 401) throw new DriveError("Google-сессия истекла — выйдите и войдите заново", 401);
  if (res.status === 403) throw new DriveError("Нет прав в Google Drive — выйдите и войдите заново, подтвердив доступ к Drive", 403);
  if (!res.ok) throw new DriveError(`Drive API ${res.status}: ${await res.text()}`, res.status);
  return res;
}

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ---------- Структура папок ----------

// Кэш ID папок на время жизни serverless-инстанса
let folderCache: Map<string, string> | null = null;
let folderCacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function findFolder(token: string, name: string, parentId?: string): Promise<string | null> {
  const q = [
    `name = '${esc(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const res = await gfetch(token, `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`);
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function createFolder(token: string, name: string, parentId?: string): Promise<string> {
  const res = await gfetch(token, `${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined }),
  });
  return (await res.json()).id;
}

/** Находит или создаёт "Personal OS" и все подпапки разделов. Возвращает имя→ID. */
export async function ensureStructure(token: string): Promise<Map<string, string>> {
  if (folderCache && Date.now() - folderCacheAt < CACHE_TTL) return folderCache;

  const map = new Map<string, string>();
  let rootId = await findFolder(token, ROOT_NAME);
  if (!rootId) rootId = await createFolder(token, ROOT_NAME);
  map.set("__root__", rootId);

  // Существующие подпапки одним запросом
  const q = `'${rootId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const res = await gfetch(token, `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=100`);
  const existing: { id: string; name: string }[] = (await res.json()).files ?? [];
  for (const f of existing) map.set(f.name, f.id);

  for (const name of SECTION_FOLDERS) {
    if (!map.has(name)) map.set(name, await createFolder(token, name, rootId));
  }

  folderCache = map;
  folderCacheAt = Date.now();
  return map;
}

// ---------- Заметки ----------

export type DriveNoteMeta = {
  id: string;
  title: string;        // имя файла без .md
  name: string;         // полное имя файла
  folder: string;       // имя подпапки
  mtime: number;        // unix ms
  size: number;
  webViewLink?: string;
};

const NOTE_FIELDS = "files(id,name,parents,modifiedTime,size,webViewLink,mimeType)";

function toMeta(f: any, folderById: Map<string, string>): DriveNoteMeta {
  const folder = (f.parents ?? []).map((p: string) => folderById.get(p)).find(Boolean) ?? "";
  return {
    id: f.id,
    name: f.name,
    title: f.name.replace(/\.md$/i, ""),
    folder,
    mtime: new Date(f.modifiedTime).getTime(),
    size: Number(f.size ?? 0),
    webViewLink: f.webViewLink,
  };
}

function invertFolders(folders: Map<string, string>): Map<string, string> {
  const inv = new Map<string, string>();
  folders.forEach((id, name) => { if (name !== "__root__") inv.set(id, name); });
  return inv;
}

function noteParentsClause(folders: Map<string, string>, only?: string[]): string {
  const names = only ?? Array.from(folders.keys()).filter((n) => n !== "__root__" && n !== "Files");
  const parts = names.map((n) => folders.get(n)).filter(Boolean).map((id) => `'${id}' in parents`);
  return "(" + parts.join(" or ") + ")";
}

/** Список .md-заметок (все разделы кроме Files, либо одна папка). Сортировка по дате изменения. */
export async function listNotes(token: string, folderName?: string): Promise<{ notes: DriveNoteMeta[]; folders: string[] }> {
  const folders = await ensureStructure(token);
  const inv = invertFolders(folders);
  const q = [
    noteParentsClause(folders, folderName ? [folderName] : undefined),
    "trashed = false",
    `mimeType != '${FOLDER_MIME}'`,
    "name contains '.md'",
  ].join(" and ");
  const url = `${API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(NOTE_FIELDS)}&orderBy=modifiedTime desc&pageSize=200`;
  const data = await (await gfetch(token, url)).json();
  const notes = (data.files ?? [])
    .filter((f: any) => /\.md$/i.test(f.name))
    .map((f: any) => toMeta(f, inv));
  const folderNames = Array.from(folders.keys()).filter((n) => n !== "__root__");
  return { notes, folders: folderNames };
}

const TAG_RE = /(^|\s)#([A-Za-zА-Яа-яЁё0-9_\/-]+)/g;

export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const m = fm[1].match(/^tags:\s*(.*)$/m);
    if (m) m[1].replace(/[\[\]"']/g, "").split(/[,\s]+/).filter(Boolean).forEach((t) => tags.add(t.replace(/^#/, "")));
  }
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(content)) !== null) tags.add(m[2]);
  return Array.from(tags);
}

export type DriveNote = DriveNoteMeta & { content: string; tags: string[] };

/** Чтение одной заметки по ID (метаданные + содержимое). */
export async function readNote(token: string, fileId: string): Promise<DriveNote> {
  const folders = await ensureStructure(token);
  const inv = invertFolders(folders);
  const metaUrl = `${API}/files/${fileId}?fields=id,name,parents,modifiedTime,size,webViewLink`;
  const [metaRes, contentRes] = await Promise.all([
    gfetch(token, metaUrl),
    gfetch(token, `${API}/files/${fileId}?alt=media`),
  ]);
  const meta = toMeta(await metaRes.json(), inv);
  const content = await contentRes.text();
  return { ...meta, content, tags: extractTags(content) };
}

export type SearchHit = DriveNoteMeta & { snippet: string; matched: "title" | "tag" | "text" };

/** Поиск: по названию (name contains) и тексту/тегам (fullText contains), в пределах структуры Personal OS. */
export async function searchNotes(token: string, query: string): Promise<SearchHit[]> {
  const q0 = query.trim();
  if (!q0) return [];
  const folders = await ensureStructure(token);
  const inv = invertFolders(folders);
  const isTag = q0.startsWith("#") || q0.toLowerCase().startsWith("tag:");
  const term = isTag ? q0.replace(/^#|^tag:/i, "") : q0;

  const base = [noteParentsClause(folders), "trashed = false", `mimeType != '${FOLDER_MIME}'`].join(" and ");
  const textQ = `${base} and (name contains '${esc(term)}' or fullText contains '${esc(term)}')`;
  const url = `${API}/files?q=${encodeURIComponent(textQ)}&fields=${encodeURIComponent(NOTE_FIELDS)}&pageSize=30`;
  const data = await (await gfetch(token, url)).json();
  const files = (data.files ?? []).filter((f: any) => /\.md$/i.test(f.name));

  const needle = term.toLowerCase();
  const hits: SearchHit[] = [];
  for (const f of files) {
    const meta = toMeta(f, inv);
    if (!isTag && meta.title.toLowerCase().includes(needle)) {
      hits.push({ ...meta, snippet: "", matched: "title" });
      continue;
    }
    // тег или совпадение по тексту — читаем содержимое для сниппета/проверки тега
    let content = "";
    try {
      content = await (await gfetch(token, `${API}/files/${f.id}?alt=media`)).text();
    } catch { continue; }
    if (isTag) {
      const tags = extractTags(content).map((t) => t.toLowerCase());
      if (tags.some((t) => t === needle || t.startsWith(needle + "/"))) {
        hits.push({ ...meta, snippet: firstLine(content), matched: "tag" });
      }
      continue;
    }
    const idx = content.toLowerCase().indexOf(needle);
    const snippet = idx >= 0
      ? (idx > 60 ? "…" : "") + content.slice(Math.max(0, idx - 60), idx + needle.length + 80).replace(/\n+/g, " ") + "…"
      : firstLine(content);
    hits.push({ ...meta, snippet, matched: "text" });
  }
  return hits;
}

function firstLine(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "").split("\n").find((l) => l.trim()) ?? "";
}

// ---------- Создание и обновление ----------

function multipartBody(metadata: object, mime: string, content: string | Buffer) {
  const boundary = "personal_os_" + Date.now();
  const head =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = typeof content === "string"
    ? head + content + tail
    : Buffer.concat([Buffer.from(head, "utf-8"), content, Buffer.from(tail, "utf-8")]);
  return { boundary, body };
}

async function findFileByName(token: string, folderId: string, name: string): Promise<string | null> {
  const q = `name = '${esc(name)}' and '${folderId}' in parents and trashed = false`;
  const data = await (await gfetch(token, `${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)).json();
  return data.files?.[0]?.id ?? null;
}

/** Создание .md-заметки в разделе. exists: "skip" — не трогать существующий файл с тем же именем,
 *  "update" — обновить содержимое (для файлов дня, которыми владеет дашборд), "new" — создать всегда. */
export async function createNote(
  token: string,
  folderName: SectionFolder,
  fileName: string,
  content: string,
  exists: "new" | "skip" | "update" = "new"
): Promise<{ id: string; path: string; created: boolean; webViewLink?: string }> {
  const folders = await ensureStructure(token);
  const folderId = folders.get(folderName);
  if (!folderId) throw new DriveError(`Папка ${folderName} не найдена`);

  if (exists !== "new") {
    const existingId = await findFileByName(token, folderId, fileName);
    if (existingId) {
      if (exists === "skip") return { id: existingId, path: `${folderName}/${fileName}`, created: false };
      // update: PATCH содержимого (файл дня принадлежит дашборду; это апдейт, не удаление)
      await gfetch(token, `${UPLOAD}/files/${existingId}?uploadType=media`, {
        method: "PATCH",
        headers: { "Content-Type": "text/markdown; charset=UTF-8" },
        body: content,
      });
      return { id: existingId, path: `${folderName}/${fileName}`, created: false };
    }
  }

  const { boundary, body } = multipartBody({ name: fileName, parents: [folderId], mimeType: "text/markdown" }, "text/markdown; charset=UTF-8", content);
  const res = await gfetch(token, `${UPLOAD}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await res.json();
  return { id: data.id, path: `${folderName}/${fileName}`, created: true, webViewLink: data.webViewLink };
}

// ---------- Files (загрузка любых файлов) ----------

export type DriveFileMeta = {
  id: string;
  name: string;
  mime: string;
  size: number;
  mtime: number;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
};

export async function listFiles(token: string): Promise<DriveFileMeta[]> {
  const folders = await ensureStructure(token);
  const filesId = folders.get("Files")!;
  const q = `'${filesId}' in parents and trashed = false`;
  const fields = "files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink)";
  const url = `${API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=modifiedTime desc&pageSize=100`;
  const data = await (await gfetch(token, url)).json();
  return (data.files ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mime: f.mimeType,
    size: Number(f.size ?? 0),
    mtime: new Date(f.modifiedTime).getTime(),
    webViewLink: f.webViewLink,
    iconLink: f.iconLink,
    thumbnailLink: f.thumbnailLink,
  }));
}

export async function uploadFile(token: string, fileName: string, mime: string, dataBase64: string): Promise<DriveFileMeta> {
  const folders = await ensureStructure(token);
  const filesId = folders.get("Files")!;
  const buf = Buffer.from(dataBase64, "base64");
  const { boundary, body } = multipartBody({ name: fileName, parents: [filesId] }, mime || "application/octet-stream", buf);
  const res = await gfetch(token, `${UPLOAD}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,iconLink`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const f = await res.json();
  return {
    id: f.id, name: f.name, mime: f.mimeType, size: Number(f.size ?? 0),
    mtime: new Date(f.modifiedTime ?? Date.now()).getTime(), webViewLink: f.webViewLink, iconLink: f.iconLink,
  };
}

// ---------- Готовые шаблоны заметок (формат совместим с Obsidian) ----------

export function nowParts(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    stamp: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`,
  };
}

export function quickNoteMd(text: string, type: string): { fileName: string; md: string } {
  const { date, time, stamp } = nowParts();
  return {
    fileName: `${stamp}-quick-note.md`,
    md: ["---", `created: ${date} ${time}`, `type: ${type}`, "tags: [inbox]", "source: dashboard", "---", "", text.trim(), ""].join("\n"),
  };
}

export function dailyNoteMd(tasks: { title: string; category?: string | null; done?: boolean }[]): { fileName: string; md: string } {
  const { date } = nowParts();
  const checklist = tasks.length
    ? tasks.map((t) => `- [${t.done ? "x" : " "}] ${t.title}${t.category ? `  #${slugTag(t.category)}` : ""}`).join("\n")
    : "- [ ] ";
  return {
    fileName: `${date}.md`,
    md: ["---", `created: ${date}`, "tags: [daily]", "source: dashboard", "---", "", `# ${date}`, "", "## Задачи на день", checklist, "", "## Заметки", ""].join("\n"),
  };
}

export function gratitudeMd(entry: {
  gratitude: string[];
  sections?: { label: string; text?: string | null }[];
  mood?: number | null;
}): { fileName: string; md: string } {
  const { date, time } = nowParts();
  const sections = (entry.sections ?? []).filter((s) => s.text?.trim());
  return {
    fileName: `${date}.md`,
    md: [
      "---",
      `created: ${date} ${time}`,
      "tags: [gratitude, reflection]",
      "source: dashboard",
      ...(entry.mood ? [`mood: ${entry.mood}/5`] : []),
      "---",
      "",
      `# Благодарность · ${date}`,
      "",
      ...entry.gratitude.filter(Boolean).map((g) => `- ${g}`),
      ...(sections.length ? ["", "## Рефлексия"] : []),
      ...sections.flatMap((s) => ["", `**${s.label}:**`, s.text!.trim()]),
      "",
    ].join("\n"),
  };
}

function slugTag(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^A-Za-zА-Яа-яЁё0-9_\/-]/g, "");
}
