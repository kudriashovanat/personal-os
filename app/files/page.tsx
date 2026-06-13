"use client";

import { useEffect, useRef, useState } from "react";
import { Card, SectionTitle, Badge, Empty } from "@/components/ui";
import { UploadCloud, ExternalLink, FileText, Loader2 } from "lucide-react";

type Upload = {
  id: string; name: string; mime: string | null; size: number | null;
  drive_link: string | null; summary: string | null; extracted_chars: number | null; created_at: string;
};

function kb(n: number | null) { return n ? `${Math.round(n / 1024)} KB` : ""; }
function ruTime(s: string) { return new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }); }

export default function FilesPage() {
  const [items, setItems] = useState<Upload[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function load() {
    fetch("/api/files").then((r) => (r.ok ? r.json() : [])).then((d) => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([]));
  }
  useEffect(() => { load(); }, []);

  async function upload(file: File) {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/files/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось загрузить");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle eyebrow="Документы под контролем" title="Файлы" />

      <Card className="mb-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line py-8 text-center transition hover:border-iris hover:bg-iris-soft/30">
          <input ref={inputRef} type="file" className="hidden" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          {busy ? <Loader2 size={26} className="animate-spin text-iris" /> : <UploadCloud size={26} className="text-iris" />}
          <span className="text-sm font-medium">{busy ? "Загружаю, извлекаю текст, делаю summary…" : "Выберите файл для загрузки"}</span>
          <span className="text-xs text-soft">PDF · DOCX · XLSX · CSV · TXT · до 4MB → Drive + карточка в Obsidian</span>
        </label>
        {err && <div className="mt-3 rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose">{err}</div>}
      </Card>

      {items === null ? (
        <Card><div className="h-24 animate-pulse rounded-xl bg-line/60" /></Card>
      ) : items.length === 0 ? (
        <Card><Empty title="Файлов пока нет" hint="Загрузите первый — он уйдёт в Google Drive, а в Obsidian появится карточка со ссылкой и кратким содержанием." /></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((u) => (
            <Card key={u.id} className="flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <FileText size={16} className="mt-0.5 shrink-0 text-iris" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-sm font-semibold">{u.name}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-soft">
                    <span>{ruTime(u.created_at)}</span>
                    {u.size != null && <span>· {kb(u.size)}</span>}
                    {u.extracted_chars != null && u.extracted_chars > 0 && <Badge className="bg-sage-soft text-sage">текст извлечён</Badge>}
                    {u.drive_link && (
                      <a href={u.drive_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-iris-deep hover:underline">
                        <ExternalLink size={11} /> Drive
                      </a>
                    )}
                  </div>
                </div>
              </div>
              {u.summary && <p className="rounded-xl bg-white/70 px-3 py-2 text-sm leading-relaxed text-ink/80">{u.summary}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
