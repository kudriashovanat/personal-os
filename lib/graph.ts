// lib/graph.ts — построение графа знаний из заметок Drive (только чтение).
// Ноды: заметки (цвет по папке-разделу) и теги. Рёбра: wiki-ссылки [[...]] между
// заметками и связи заметка→тег. Результат кэшируется на 5 минут на инстанс.

import { listNotes, readNote, extractTags, type DriveNoteMeta } from "@/lib/drive";

export type GraphNode = {
  id: string;            // drive file id для заметок, "tag:<имя>" для тегов
  kind: "note" | "tag";
  label: string;
  folder?: string;       // для заметок
  links: number;         // степень ноды (для размера)
};

export type GraphLink = {
  source: string;
  target: string;
  kind: "wiki" | "tag";
};

export type Graph = {
  nodes: GraphNode[];
  links: GraphLink[];
  folders: string[];
  truncated: boolean;    // true, если заметок больше лимита чтения
  builtAt: number;
};

const WIKI_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

/** Извлекает названия заметок из wiki-ссылок [[Название]], [[Название|алиас]], [[Название#секция]]. */
export function extractWikiLinks(content: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  WIKI_RE.lastIndex = 0;
  while ((m = WIKI_RE.exec(content)) !== null) {
    const t = m[1].trim();
    if (t) out.add(t);
  }
  return Array.from(out);
}

// Чтение содержимого ограничиваем, чтобы граф строился быстро и не упирался в лимиты Drive.
const READ_LIMIT = 120;
const BATCH = 8;

let cache: Graph | null = null;
let cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

export function invalidateGraphCache() {
  cache = null;
}

export async function buildGraph(token: string, force = false): Promise<Graph> {
  if (!force && cache && Date.now() - cacheAt < CACHE_TTL) return cache;

  const { notes, folders } = await listNotes(token);
  const subset = notes.slice(0, READ_LIMIT);
  const truncated = notes.length > READ_LIMIT;

  // Индекс "название (lowercase)" → нода, для резолва wiki-ссылок
  const byTitle = new Map<string, DriveNoteMeta>();
  for (const n of subset) {
    const key = n.title.toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, n);
  }

  const nodes = new Map<string, GraphNode>();
  for (const n of subset) {
    nodes.set(n.id, { id: n.id, kind: "note", label: n.title, folder: n.folder, links: 0 });
  }

  const links: GraphLink[] = [];
  const seenLink = new Set<string>();
  function addLink(source: string, target: string, kind: GraphLink["kind"]) {
    if (source === target) return;
    const key = source < target ? `${source}|${target}|${kind}` : `${target}|${source}|${kind}`;
    if (seenLink.has(key)) return;
    seenLink.add(key);
    links.push({ source, target, kind });
    const a = nodes.get(source); if (a) a.links++;
    const b = nodes.get(target); if (b) b.links++;
  }

  // Читаем содержимое пачками
  for (let i = 0; i < subset.length; i += BATCH) {
    const batch = subset.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map((n) => readNote(token, n.id)));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status !== "fulfilled") continue;
      const note = batch[j];
      const { content, tags } = r.value;

      // wiki-ссылки → рёбра заметка-заметка (если цель есть среди заметок)
      for (const target of extractWikiLinks(content)) {
        const hit = byTitle.get(target.toLowerCase());
        if (hit) addLink(note.id, hit.id, "wiki");
      }

      // теги → нода тега + ребро заметка-тег
      for (const t of tags) {
        const tagId = `tag:${t.toLowerCase()}`;
        if (!nodes.has(tagId)) nodes.set(tagId, { id: tagId, kind: "tag", label: `#${t}`, links: 0 });
        addLink(note.id, tagId, "tag");
      }
    }
  }

  // Теги-одиночки (связаны лишь с одной заметкой) загромождают граф — убираем
  for (const [id, n] of Array.from(nodes)) {
    if (n.kind === "tag" && n.links < 2) {
      nodes.delete(id);
    }
  }
  const alive = new Set(Array.from(nodes.keys()));
  const filteredLinks = links.filter((l) => alive.has(l.source) && alive.has(l.target));
  // Пересчёт степеней после фильтрации
  nodes.forEach((n) => (n.links = 0));
  for (const l of filteredLinks) {
    const a = nodes.get(l.source); if (a) a.links++;
    const b = nodes.get(l.target); if (b) b.links++;
  }

  const graph: Graph = {
    nodes: Array.from(nodes.values()),
    links: filteredLinks,
    folders,
    truncated,
    builtAt: Date.now(),
  };
  cache = graph;
  cacheAt = Date.now();
  return graph;
}
