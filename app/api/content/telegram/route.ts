import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { draftPost, anthropicConfigured } from "@/lib/agents";
import { sendTelegramMessage } from "@/lib/telegram";
import { projectToSecondBrain } from "@/lib/secondbrain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Идея контента → развёрнутый черновик → тебе в Telegram (не публикуется).
// Дополнительно: best-effort .md в Second Brain и статус «черновик».
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  if (!anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан" }, { status: 503 });
  const accessToken = (session as any).accessToken as string | undefined;
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Нет id" }, { status: 400 });

    const sb = getSupabase();
    const { data: idea, error } = await sb.from("content_ideas").select("id, title, platform, topic, hook").eq("id", id).single();
    if (error || !idea) return NextResponse.json({ error: "Идея не найдена" }, { status: 404 });

    const { text } = await draftPost(idea);

    const message = `📝 Черновик поста · ${idea.platform || "Telegram"}\n«${idea.title}»\n\n${text}`;
    const sent = await sendTelegramMessage(message);
    if (!sent.ok) return NextResponse.json({ error: sent.reason || "Telegram не настроен" }, { status: 502 });

    // best-effort: сохранить черновик в Second Brain и пометить статус
    try {
      const md = `---\ntype: content-draft\ntitle: ${JSON.stringify(idea.title)}\nplatform: ${idea.platform || "Telegram"}\ndate: ${new Date().toISOString().slice(0, 10)}\ntags: #content-draft\n---\n\n# ${idea.title}\n\n${text}\n`;
      const fileName = `${new Date().toISOString().slice(0, 10)}-draft-${idea.title}`.slice(0, 70).replace(/[^a-z0-9а-яё]+/gi, "-") + ".md";
      await projectToSecondBrain(accessToken, "content-ideas", fileName, md);
    } catch { /* не критично */ }
    try { await sb.from("content_ideas").update({ status: "черновик" }).eq("id", id); } catch { /* не критично */ }

    return NextResponse.json({ ok: true, preview: text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
