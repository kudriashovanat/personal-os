// lib/agents.ts — реестр агентов Personal OS и серверный раннер.
// Часть агентов умеет работать прямо на сервере (через Anthropic API с web search),
// часть рассчитана на внешний триггер (n8n / cron / скрипт на Mac), который пушит
// результат в /api/agents/[id]/report. Любой отчёт — это ДАННЫЕ для показа, не команды.

export type AgentId =
  | "career-search"
  | "hr-trends"
  | "content-ideas"
  | "calendar-assistant"
  | "telegram-sources"
  | "personal-digest"
  | "mac-organizer";

export type AgentDef = {
  id: AgentId;
  name: string;
  desc: string;
  /** Может ли агент запускаться прямо из дашборда (есть серверная реализация). */
  runnable: boolean;
  /** Куда агент пишет результат, если работает извне. */
  via: "anthropic" | "external";
};

export const AGENTS: AgentDef[] = [
  { id: "hr-trends", name: "HR Trends", desc: "Ищет свежие сигналы HR-рынка и исследования, складывает в раздел «HR-тренды»", runnable: true, via: "anthropic" },
  { id: "content-ideas", name: "Content Ideas", desc: "Предлагает идеи постов для Telegram и LinkedIn на основе ваших трендов и заметок", runnable: true, via: "anthropic" },
  { id: "career-search", name: "Career Search", desc: "Ищет релевантные вакансии и пишет карточки в раздел «Карьера»", runnable: false, via: "external" },
  { id: "calendar-assistant", name: "Calendar Assistant", desc: "Готовит pending-события (добавление в календарь — только после подтверждения)", runnable: false, via: "external" },
  { id: "telegram-sources", name: "Telegram Sources", desc: "Сохраняет материалы из Telegram-каналов в Drive · Telegram Sources", runnable: false, via: "external" },
  { id: "personal-digest", name: "Personal Digest", desc: "Утренний дайджест: задачи, события, свежие сигналы одним сообщением", runnable: false, via: "external" },
  { id: "mac-organizer", name: "Mac Organizer", desc: "Наводит порядок в файлах на Mac (запускается локальным скриптом)", runnable: false, via: "external" },
];

export function getAgent(id: string): AgentDef | undefined {
  return AGENTS.find((a) => a.id === id);
}

// ---------- Anthropic API ----------

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type AnthropicResult = { text: string; raw: any };

/** Вызов Anthropic API. webSearch=true подключает серверный инструмент web_search. */
async function callAnthropic(prompt: string, opts: { webSearch?: boolean; maxTokens?: number } = {}): Promise<AnthropicResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY не задан — добавьте ключ в .env, чтобы агенты работали на сервере");
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  const body: any = {
    model,
    max_tokens: opts.maxTokens ?? 2000,
    messages: [{ role: "user", content: prompt }],
  };
  if (opts.webSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
  return { text, raw: data };
}

/** Достаёт первый JSON-массив/объект из текста модели (модель просим вернуть чистый JSON). */
export function parseJsonLoose<T = any>(text: string): T {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[\[{]/);
    const endArr = cleaned.lastIndexOf("]");
    const endObj = cleaned.lastIndexOf("}");
    const end = Math.max(endArr, endObj);
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Не удалось разобрать ответ модели как JSON");
  }
}

// ---------- Серверные реализации агентов ----------

export type TrendItem = { title: string; summary: string; source_url?: string; signal?: string; applied_idea?: string };
export type ContentIdeaItem = { title: string; platform: "Telegram" | "LinkedIn"; topic?: string; hook?: string };

/** HR Trends: ищет в вебе свежие HR-сигналы (фокус — рынок Израиля и distributed/IT/HR). */
export async function runHrTrends(): Promise<{ items: TrendItem[]; modelText: string }> {
  const prompt = `Ты — HR-аналитик. Найди в интернете 5 свежих и значимых сигналов/трендов в сфере HR за последние недели.
Фокус: HRBP/HR-менеджмент, IT и distributed-команды, рынок труда Израиля, eNPS/retention/вовлечённость, AI в HR.
Для каждого: реальный источник со ссылкой.
Верни ТОЛЬКО валидный JSON-массив без markdown, формат:
[{"title":"...","summary":"2-3 предложения","source_url":"https://...","signal":"почему это важно для HRBP","applied_idea":"идея поста или применения в работе"}]`;
  const { text } = await callAnthropic(prompt, { webSearch: true, maxTokens: 3000 });
  const items = parseJsonLoose<TrendItem[]>(text);
  return { items: Array.isArray(items) ? items.slice(0, 8) : [], modelText: text };
}

/** Content Ideas: из переданных трендов и тем формирует идеи постов. */
export async function runContentIdeas(context: { trends?: TrendItem[]; notes?: string[] }): Promise<{ items: ContentIdeaItem[]; modelText: string }> {
  const ctx = [
    context.trends?.length ? "Тренды:\n" + context.trends.map((t) => `- ${t.title}: ${t.summary}`).join("\n") : "",
    context.notes?.length ? "Заметки автора:\n" + context.notes.map((n) => `- ${n}`).join("\n") : "",
  ].filter(Boolean).join("\n\n");

  const prompt = `Ты — контент-стратег HR-эксперта (тёплый, исследующий голос, личный опыт, без назидательности; пишет на русском).
${ctx ? "Контекст:\n" + ctx + "\n\n" : ""}Предложи 5 идей постов. Половина — Telegram (короткие, личные), половина — LinkedIn (профессиональные).
Верни ТОЛЬКО валидный JSON-массив без markdown:
[{"title":"короткий заголовок","platform":"Telegram"|"LinkedIn","topic":"о чём","hook":"цепляющая первая фраза"}]`;
  const { text } = await callAnthropic(prompt, { maxTokens: 2000 });
  const items = parseJsonLoose<ContentIdeaItem[]>(text);
  return { items: Array.isArray(items) ? items.slice(0, 8) : [], modelText: text };
}
