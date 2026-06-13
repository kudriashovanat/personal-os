// lib/telegram.ts — отправка сообщений тебе в Telegram через Bot API.
// Только исходящие черновики для ручного редактирования; ничего не публикуется.

export async function sendTelegramMessage(text: string): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, reason: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096), disable_web_page_preview: true }),
    });
    if (!res.ok) return { ok: false, reason: `Telegram API ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e.message };
  }
}
