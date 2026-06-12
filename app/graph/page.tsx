"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type SimulationNodeDatum, type SimulationLinkDatum,
} from "d3-force";
import { Network, Loader2, RefreshCw, X, FolderOpen, Hash, List } from "lucide-react";
import { Card, SectionTitle, Button, Chip, Badge, Empty } from "@/components/ui";

type GNode = { id: string; kind: "note" | "tag"; label: string; folder?: string; links: number };
type GLink = { source: string; target: string; kind: "wiki" | "tag" };
type Graph = { nodes: GNode[]; links: GLink[]; folders: string[]; truncated: boolean };

type SimNode = GNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & { kind: string };

type Note = { id: string; title: string; folder: string; content: string; tags: string[] };

const FOLDER_COLORS: Record<string, string> = {
  "Inbox": "#7C6FE4", "Daily": "#5E8FC9", "Gratitude": "#D2738F",
  "Telegram Sources": "#7FA877", "Career": "#C9A23F", "Content Ideas": "#C98A5E",
};
const DEFAULT_NOTE_COLOR = "#8B89A0";
const TAG_COLOR = "#B9B5D4";

function colorOf(n: GNode) {
  if (n.kind === "tag") return TAG_COLOR;
  return FOLDER_COLORS[n.folder ?? ""] ?? DEFAULT_NOTE_COLOR;
}

function preprocessMd(md: string) {
  return md
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "**$2**")
    .replace(/\[\[([^\]]+)\]\]/g, "**$1**");
}

export default function GraphPage() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showTags, setShowTags] = useState(true);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [listMode, setListMode] = useState(false);

  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);
  const simRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);

  const [openNote, setOpenNote] = useState<Note | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/graph${refresh ? "?refresh=1" : ""}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setGraph(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Размер контейнера + мобильный режим по умолчанию
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setSize({ w, h: Math.max(420, Math.min(640, Math.round(w * 0.7))) });
      if (window.innerWidth < 640) setListMode(true);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Отфильтрованный граф
  const filtered = useMemo(() => {
    if (!graph) return { nodes: [] as GNode[], links: [] as GLink[] };
    let nodes = graph.nodes;
    if (!showTags) nodes = nodes.filter((n) => n.kind !== "tag");
    if (folderFilter) {
      const keepNotes = new Set(nodes.filter((n) => n.kind === "note" && n.folder === folderFilter).map((n) => n.id));
      // оставляем теги, связанные с выбранной папкой
      const tagIds = new Set(
        graph.links
          .filter((l) => l.kind === "tag" && (keepNotes.has(l.source) || keepNotes.has(l.target)))
          .flatMap((l) => [l.source, l.target])
          .filter((id) => id.startsWith("tag:"))
      );
      nodes = nodes.filter((n) => (n.kind === "note" ? keepNotes.has(n.id) : tagIds.has(n.id)));
    }
    const alive = new Set(nodes.map((n) => n.id));
    const links = graph.links.filter((l) => alive.has(l.source) && alive.has(l.target));
    return { nodes, links };
  }, [graph, showTags, folderFilter]);

  // Симуляция
  useEffect(() => {
    simRef.current?.stop();
    if (listMode || filtered.nodes.length === 0) { setSimNodes([]); setSimLinks([]); return; }

    const nodes: SimNode[] = filtered.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = filtered.links.map((l) => ({ source: l.source, target: l.target, kind: l.kind }));

    const sim = forceSimulation<SimNode>(nodes)
      .force("link", forceLink<SimNode, SimLink>(links).id((d) => d.id).distance((l) => (l.kind === "tag" ? 60 : 90)).strength(0.5))
      .force("charge", forceManyBody().strength(-120))
      .force("center", forceCenter(size.w / 2, size.h / 2))
      .force("collide", forceCollide<SimNode>().radius((d) => 10 + Math.min(d.links * 1.5, 14)));

    sim.on("tick", () => {
      setSimNodes([...nodes]);
      setSimLinks([...links]);
    });
    sim.alpha(1).restart();
    simRef.current = sim;
    return () => { sim.stop(); };
  }, [filtered, size.w, size.h, listMode]);

  async function open(id: string) {
    if (id.startsWith("tag:")) return;
    setNoteLoading(true);
    setOpenNote({ id, title: "", folder: "", content: "", tags: [] });
    try {
      const r = await fetch(`/api/vault/note?id=${encodeURIComponent(id)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setOpenNote(data);
    } catch (e: any) {
      setOpenNote(null); setError(e.message);
    } finally {
      setNoteLoading(false);
    }
  }

  // Топ-связи для мобильного/спискового режима
  const topNodes = useMemo(
    () => filtered.nodes.filter((n) => n.kind === "note").sort((a, b) => b.links - a.links).slice(0, 30),
    [filtered]
  );

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow="Связи между заметками"
        title="Граф знаний"
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setListMode((v) => !v)} className="px-3 py-1.5 text-xs">
              {listMode ? <><Network size={14} className="mr-1" /> Граф</> : <><List size={14} className="mr-1" /> Список</>}
            </Button>
            <Button variant="soft" onClick={() => load(true)} disabled={loading} className="px-3 py-1.5 text-xs">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <><RefreshCw size={13} className="mr-1" /> Обновить</>}
            </Button>
          </div>
        }
      />
      {error && <div className="rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose">{error}</div>}

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={!folderFilter} onClick={() => setFolderFilter(null)}>Все разделы</Chip>
        {graph?.folders.map((f) => (
          <Chip key={f} active={folderFilter === f} onClick={() => setFolderFilter(folderFilter === f ? null : f)}>{f}</Chip>
        ))}
        <Chip active={showTags} onClick={() => setShowTags((v) => !v)}>
          <Hash size={11} className="mr-0.5 inline" /> теги
        </Chip>
      </div>

      <div ref={wrapRef}>
        {loading && !graph ? (
          <Card className="flex h-72 items-center justify-center">
            <p className="flex items-center gap-2 text-sm text-soft"><Loader2 size={15} className="animate-spin" /> Строю граф из заметок Drive…</p>
          </Card>
        ) : filtered.nodes.length === 0 ? (
          <Empty icon={<Network size={20} />} title="Связей пока нет" hint="Используйте [[wiki-ссылки]] и #теги в заметках — граф соберётся сам" />
        ) : listMode ? (
          <div className="space-y-2">
            {topNodes.map((n) => (
              <button key={n.id} onClick={() => open(n.id)} className="glass flex w-full items-center gap-3 rounded-xl2 p-3.5 text-left transition hover:shadow-lift">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorOf(n) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{n.label}</span>
                  <span className="text-[11px] text-soft/70">{n.folder || "корень"}</span>
                </span>
                <Badge className="bg-iris-soft text-iris-deep">{n.links} связ.</Badge>
              </button>
            ))}
          </div>
        ) : (
          <Card className="overflow-hidden p-0">
            <svg width={size.w} height={size.h} className="block touch-pan-y">
              {simLinks.map((l, i) => {
                const s = l.source as SimNode, t = l.target as SimNode;
                if (typeof s !== "object" || typeof t !== "object") return null;
                return (
                  <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                    stroke={l.kind === "wiki" ? "#7C6FE4" : "#D8D5E8"}
                    strokeWidth={l.kind === "wiki" ? 1.6 : 1}
                    strokeOpacity={l.kind === "wiki" ? 0.55 : 0.5}
                  />
                );
              })}
              {simNodes.map((n) => {
                const r = n.kind === "tag" ? 5 + Math.min(n.links, 8) : 7 + Math.min(n.links * 1.3, 12);
                return (
                  <g key={n.id} transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                     onClick={() => open(n.id)} style={{ cursor: n.kind === "note" ? "pointer" : "default" }}>
                    <circle r={r} fill={colorOf(n)} fillOpacity={n.kind === "tag" ? 0.7 : 0.92} stroke="#fff" strokeWidth={1.5} />
                    <text y={r + 11} textAnchor="middle" className="select-none"
                          fontSize={n.kind === "tag" ? 9 : 10} fill="#6F6E80">
                      {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </Card>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-soft/80">
        {Object.entries(FOLDER_COLORS).map(([f, c]) => (
          <span key={f} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {f}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TAG_COLOR }} /> #тег</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-5" style={{ background: "#7C6FE4" }} /> wiki-ссылка</span>
        {graph?.truncated && <span className="text-soft/60">· показаны 120 свежих заметок</span>}
      </div>

      <AnimatePresence>
        {openNote && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-3 backdrop-blur-sm sm:items-center"
            onClick={() => setOpenNote(null)}
          >
            <motion.div
              initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 28, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-line p-5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] text-soft/70"><FolderOpen size={12} /> {openNote.folder || "…"}</p>
                  <h2 className="mt-1 truncate font-display text-xl">{openNote.title || "…"}</h2>
                  {openNote.tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {openNote.tags.slice(0, 8).map((t) => <Badge key={t} className="bg-sage-soft text-sage">#{t}</Badge>)}
                    </div>
                  )}
                </div>
                <button onClick={() => setOpenNote(null)} className="rounded-full p-1.5 text-soft hover:bg-ink/5"><X size={18} /></button>
              </div>
              <div className="overflow-y-auto p-5">
                {noteLoading ? (
                  <p className="flex items-center gap-2 text-sm text-soft"><Loader2 size={14} className="animate-spin" /> Открываю…</p>
                ) : (
                  <article className="prose-note">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{preprocessMd(openNote.content)}</ReactMarkdown>
                  </article>
                )}
              </div>
              <div className="border-t border-line p-3 text-center text-[11px] text-soft/70">
                Полный раздел заметок — на странице Second Brain
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
