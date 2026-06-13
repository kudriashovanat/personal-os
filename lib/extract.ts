// lib/extract.ts — серверное извлечение текста из загруженных файлов.
// Defensive: любой сбой парсера → пустой текст, загрузка не падает.
// Требует серверный (nodejs) runtime — модули pdf-parse/mammoth/xlsx.

export type Extracted = { text: string; chars: number };

function ext(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export async function extractText(bytes: Uint8Array, mime: string, name: string): Promise<Extracted> {
  const e = ext(name);
  const m = (mime || "").toLowerCase();
  let text = "";
  try {
    if (m.includes("pdf") || e === "pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: bytes });
      const res = await parser.getText();
      text = res?.text ?? "";
    } else if (m.includes("wordprocessingml") || e === "docx") {
      const mammoth: any = await import("mammoth");
      const r = await (mammoth.extractRawText ?? mammoth.default?.extractRawText)({ buffer: Buffer.from(bytes) });
      text = r?.value ?? "";
    } else if (m.includes("spreadsheet") || m.includes("excel") || e === "xlsx" || e === "xls" || e === "csv") {
      const XLSX: any = await import("xlsx");
      const wb = XLSX.read(bytes, { type: "array" });
      text = wb.SheetNames.map((n: string) => `## ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join("\n\n");
    } else if (m.startsWith("text/") || e === "txt" || e === "md") {
      text = new TextDecoder("utf-8").decode(bytes);
    }
  } catch {
    text = "";
  }
  text = (text || "").trim();
  return { text, chars: text.length };
}
