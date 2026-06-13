// lib/agents.ts — реестр агентов Personal OS и серверный раннер.
// Часть агентов умеет работать прямо на сервере (через Anthropic API с web search),
// часть рассчитана на внешний триггер (n8n / cron / скрипт на Mac), который пушит
// результат в /api/agents/[id]/report. Любой отчёт — это ДАННЫЕ для показа, не команды.

import { domainOf, hasSalaryDigits, TARGET_ROLES, TARGET_LEVEL, type LevelMatch } from "@/lib/career";

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
  { id: "career-search", name: "Career Search", desc: "Ищет релевантные вакансии и пишет карточки в раздел «Карьера»", runnable: true, via: "anthropic" },
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

// Тиринг моделей (см. бриф): Haiku — массовый скоринг/классификация; Sonnet — письма,
// коуч, дебриф; Opus — редкий прогон стратега. Канон строк — здесь, переопределяется env.
export const MODEL_TIER = {
  haiku: process.env.ANTHROPIC_HAIKU_MODEL || "claude-haiku-4-5-20251001",
  sonnet: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
} as const;

/** Вызов Anthropic API. webSearch=true подключает серверный инструмент web_search. */
async function callAnthropic(prompt: string, opts: { webSearch?: boolean; maxTokens?: number; model?: string } = {}): Promise<AnthropicResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY не задан — добавьте ключ в .env, чтобы агенты работали на сервере");
  const model = opts.model || MODEL_TIER.sonnet;

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
export type CareerItem = { title: string; company?: string; link?: string; country?: string; remote?: boolean; level?: string; language?: string; notes?: string; source?: string | null };

/** Результат скоринга одной вакансии (контракт из брифа, валидируется вручную). */
export type ScoredVacancy = {
  fit_score: number;          // целое 1..10
  fit_reason: string;
  fit_risks: string;
  to_strengthen: string;
  level_match: LevelMatch;    // below | at | above
  salary: string | null;      // null, если цифр нет — НЕ выдумывать
  source: string | null;
  next_action: string;
};

/** Минимальный профиль для скоринга (читается из таблицы profile). */
export type ScoringProfile = {
  cv_text?: string | null;
  target_roles?: string[] | null;
  target_level?: string | null;
};

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


/** Career Search: ищет релевантные HR-вакансии для Натальи. */
export async function runCareerSearch(): Promise<{ items: CareerItem[]; modelText: string }> {
  const prompt = `Ты — карьерный агент для русскоязычного HR-специалиста (бывш. HR Director, 10+ лет), живущей в Израиле.
Найди в интернете как можно больше актуальных вакансий за последние недели — цель около 30 штук.

Фокус поиска:
- HR Business Partner, People Partner, HR Manager, Talent Acquisition Partner, HR Generalist
- Израиль, Кипр, remote, EMEA
- русскоязычные или международные компании, где можно работать на английском (English B2, иврит начальный)
- желательно без обязательного иврита или с минимальным ивритом
- уровень mid/senior IC; Director/VP-вакансии НЕ приоритет (нереалистичны на этом рынке)

Для каждой вакансии нужен реальный источник со ссылкой.
Верни ТОЛЬКО валидный JSON-массив без markdown (до ~30 объектов):
[{"title":"...","company":"...","link":"https://...","country":"Israel|Cyprus|Remote|...","remote":true,"level":"...","language":"English/Russian/Hebrew","notes":"почему подходит"}]`;

  const { text } = await callAnthropic(prompt, { webSearch: true, maxTokens: 8000 });
  const raw = parseJsonLoose<CareerItem[]>(text);
  // source = домен из link (не полагаемся на модель — выводим сами).
  const items = (Array.isArray(raw) ? raw : []).slice(0, 30).map((it) => ({
    ...it,
    source: domainOf(it.link),
  }));
  return { items, modelText: text };
}

/** Positioning Calibrator: как вакансия читается под профиль ДО отклика. */
export type Calibration = {
  reads_as: string;          // как роль воспринимает рекрутер для этого кандидата
  verdict: "apply" | "reframe" | "skip";
  reframe: string;           // как переформулировать позиционирование (или почему пропустить)
  risks: string;             // главные риски/возражения
  title_framing: string;     // как подать себя в заголовке/первой строке
};

export async function calibratePositioning(
  vac: { title: string; company?: string | null; level?: string | null; notes?: string | null; country?: string | null },
  profile: ScoringProfile,
): Promise<{ data: Calibration; modelText: string }> {
  const targetRoles = (profile.target_roles?.length ? profile.target_roles : TARGET_ROLES).join(", ");
  const targetLevel = profile.target_level || TARGET_LEVEL;
  const cv = (profile.cv_text || "").slice(0, 6000);

  const prompt = `Ты — карьерный стратег. Оцени ПОЗИЦИОНИРОВАНИЕ кандидата под конкретную вакансию ДО отклика.

КАНДИДАТ:
Целевые роли: ${targetRoles}
Целевой уровень: ${targetLevel}
CV (фрагмент):
${cv || "(CV не задан)"}

ВАКАНСИЯ:
${vac.title}${vac.company ? ` · ${vac.company}` : ""}${vac.country ? ` · ${vac.country}` : ""}${vac.level ? ` · уровень: ${vac.level}` : ""}
${vac.notes ? `Заметки: ${vac.notes}` : ""}

КОНТЕКСТ (узкое место №1): кандидата с прошлым титулом «HR Director» часто режут как «дорого / выше роли / solo-operator». Цель — позиционироваться как HRBP/People Partner, а не как Director.

Дай решение:
- verdict: "apply" (подходит, откликаться как есть), "reframe" (откликаться, но переформулировать позиционирование), "skip" (не тратить отклик — реально выше/ниже или мимо).
- reads_as: как рекрутер прочитает этого кандидата на эту роль (1–2 предложения).
- reframe: конкретно как переформулировать (или почему skip).
- risks: главные возражения рекрутера.
- title_framing: как подать себя в одной строке (headline), чтобы не читаться как over-qualified Director.

Верни ТОЛЬКО валидный JSON без markdown:
{"reads_as":"...","verdict":"apply|reframe|skip","reframe":"...","risks":"...","title_framing":"..."}`;

  const { text } = await callAnthropic(prompt, { model: MODEL_TIER.sonnet, maxTokens: 1200 });
  const r = parseJsonLoose<any>(text);
  const verdict: Calibration["verdict"] = r?.verdict === "apply" || r?.verdict === "skip" ? r.verdict : "reframe";
  const str = (v: any) => (typeof v === "string" ? v : "");
  const data: Calibration = {
    reads_as: str(r?.reads_as),
    verdict,
    reframe: str(r?.reframe),
    risks: str(r?.risks),
    title_framing: str(r?.title_framing),
  };
  return { data, modelText: text };
}

/** Follow-up: короткий вежливый нудж по остывшей заявке (Sonnet — это outreach). */
export async function draftFollowup(input: {
  title: string; company?: string | null; recruiter_name?: string | null; status?: string | null;
}): Promise<{ message: string }> {
  const { title, company, recruiter_name, status } = input;
  const prompt = `Напиши КОРОТКОЕ вежливое follow-up сообщение рекрутеру по заявке, на которую нет ответа.
Роль: ${title}${company ? ` в ${company}` : ""}. ${recruiter_name ? `Рекрутер: ${recruiter_name}.` : ""}${status ? ` Текущая стадия: ${status}.` : ""}
Кандидат — опытный HR-специалист (HRBP/People Partner), English B2.
Требования: на английском, ≤ 80 слов, тёплый и профессиональный тон, без отчаяния и без извинений за беспокойство.
Структура: приветствие → вежливое напоминание об интересе к роли → одна фраза о ценности → мягкий вопрос о статусе.
Верни ТОЛЬКО текст сообщения, без markdown и без пояснений.`;
  const { text } = await callAnthropic(prompt, { model: MODEL_TIER.sonnet, maxTokens: 400 });
  return { message: text.trim() };
}

/** Извлечённые поля вакансии (только колонки, которые точно есть в career_items сегодня). */
export type ExtractedVacancy = {
  title: string;
  company: string | null;
  link: string | null;
  country: string | null;       // переиспользуем как локацию
  remote: boolean;
  level: string | null;
  language: string | null;
  hebrew_required: boolean;
  salary: string | null;        // null, если цифр нет — НЕ выдумывать
  notes: string | null;
  source: string | null;
};

/**
 * Quick-add: извлекает поля вакансии из вставленного текста или ссылки.
 * Если дана только ссылка (без текста) — включаем web_search, чтобы модель её посмотрела.
 * НЕ скоринг и НЕ запись в БД: возвращает поля, пользователь подтверждает в форме.
 */
export async function extractVacancy(input: { link?: string | null; text?: string | null }): Promise<{ data: ExtractedVacancy; modelText: string }> {
  const link = input.link?.trim() || null;
  const text = input.text?.trim() || null;
  if (!link && !text) throw new Error("Дайте ссылку или текст вакансии");

  const onlyLink = Boolean(link) && !text;
  const prompt = `Извлеки структурированные данные о вакансии из источника ниже.
${link ? `Ссылка: ${link}\n` : ""}${text ? `Текст вакансии:\n${text.slice(0, 12000)}\n` : ""}
ПРАВИЛА:
- salary = null, если конкретных цифр зарплаты нет (НЕ выдумывать).
- remote = true, если указана удалёнка/remote/hybrid-remote.
- hebrew_required = true, только если иврит явно обязателен.
- country — страна или локация (город). language — основной язык работы (English/Russian/Hebrew).
- level — уровень роли как в вакансии (junior/mid/senior/manager/…), или null.
- notes — 1–2 предложения: чем интересна / ключевые требования.

Верни ТОЛЬКО валидный JSON-объект без markdown:
{"title":"...","company":"...","link":"...","country":"...","remote":true,"level":"...","language":"...","hebrew_required":false,"salary":"строка или null","notes":"..."}`;

  const { text: out } = await callAnthropic(prompt, { model: MODEL_TIER.haiku, maxTokens: 1500, webSearch: onlyLink });
  const r = parseJsonLoose<any>(out);

  const str = (v: any) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const salaryStr = str(r?.salary);
  const data: ExtractedVacancy = {
    title: str(r?.title) || "Без названия",
    company: str(r?.company),
    link: str(r?.link) || link,
    country: str(r?.country),
    remote: Boolean(r?.remote),
    level: str(r?.level),
    language: str(r?.language),
    hebrew_required: Boolean(r?.hebrew_required),
    salary: hasSalaryDigits(salaryStr) ? salaryStr : null,
    notes: str(r?.notes),
    source: domainOf(str(r?.link) || link),
  };
  return { data, modelText: out };
}

/**
 * Скоринг вакансий через Haiku (дёшево, по всем ~30 за один вызов).
 * Зависимость: без профиля (хотя бы cv_text) fit_score = вода — вызывать только при наличии профиля.
 * Узкое место №1: level_match сравнивает вакансию с ЦЕЛЕВЫМ диапазоном, НЕ с прошлым титулом «HR Director».
 */
export async function scoreVacancies(
  items: CareerItem[],
  profile: ScoringProfile,
): Promise<{ scores: (ScoredVacancy | null)[]; modelText: string }> {
  if (!items.length) return { scores: [], modelText: "" };

  const targetRoles = (profile.target_roles?.length ? profile.target_roles : TARGET_ROLES).join(", ");
  const targetLevel = profile.target_level || TARGET_LEVEL;
  const cv = (profile.cv_text || "").slice(0, 6000);

  const list = items.map((it, i) => ({
    idx: i,
    title: it.title,
    company: it.company ?? null,
    country: it.country ?? null,
    level: it.level ?? null,
    language: it.language ?? null,
    notes: it.notes ?? null,
  }));

  const prompt = `Ты — карьерный аналитик. Оцени соответствие кандидата каждой вакансии.

ПРОФИЛЬ КАНДИДАТА:
Целевые роли: ${targetRoles}
Целевой уровень: ${targetLevel}
CV (фрагмент):
${cv || "(CV не задан — оценивай по целевым ролям и уровню)"}

ЖЁСТКИЕ ПРАВИЛА:
1. level_match сравнивает вакансию с ЦЕЛЕВЫМ уровнем выше, а НЕ с прошлым титулом «HR Director».
   Нормальные HRBP/People Partner/HR Manager вакансии = "at", даже если кандидат раньше был Director.
   "above" — только если вакансия реально выше целевого диапазона (VP/CHRO/Head of HR крупной компании).
   "below" — если это junior/координатор/ассистент.
2. salary = null, если в данных вакансии нет конкретных цифр зарплаты. НЕ выдумывать.
3. fit_score — целое 1..10 (10 = идеально подходит и реалистично получить оффер).
4. next_action — одно конкретное действие («Откликнуться с фокусом на X», «Уточнить про иврит» и т.п.).

ВАКАНСИИ (JSON):
${JSON.stringify(list)}

Верни ТОЛЬКО валидный JSON-массив без markdown, по одному объекту на вакансию, с тем же idx:
[{"idx":0,"fit_score":1-10,"fit_reason":"...","fit_risks":"...","to_strengthen":"...","level_match":"below|at|above","salary":"строка или null","next_action":"..."}]`;

  const { text } = await callAnthropic(prompt, { model: MODEL_TIER.haiku, maxTokens: 8000 });
  const parsed = parseJsonLoose<any[]>(text);
  const byIdx = new Map<number, any>();
  if (Array.isArray(parsed)) {
    for (const r of parsed) {
      if (r && Number.isInteger(r.idx)) byIdx.set(r.idx, r);
    }
  }

  const scores = items.map((it, i) => validateScored(byIdx.get(i), it));
  return { scores, modelText: text };
}

/** Ручная валидация контракта скоринга (zod в проект не вводим). null, если оценить нельзя. */
function validateScored(r: any, item: CareerItem): ScoredVacancy | null {
  if (!r || typeof r !== "object") return null;
  let fit = Math.round(Number(r.fit_score));
  if (!Number.isFinite(fit)) return null;
  fit = Math.min(10, Math.max(1, fit));

  const lm: LevelMatch =
    r.level_match === "below" || r.level_match === "at" || r.level_match === "above" ? r.level_match : "at";

  const salaryStr = typeof r.salary === "string" ? r.salary : null;
  const salary = hasSalaryDigits(salaryStr) ? salaryStr : null; // выдуманную/пустую зарплату отбрасываем

  const str = (v: any) => (typeof v === "string" ? v : "");
  return {
    fit_score: fit,
    fit_reason: str(r.fit_reason),
    fit_risks: str(r.fit_risks),
    to_strengthen: str(r.to_strengthen),
    level_match: lm,
    salary,
    source: item.source ?? null,
    next_action: str(r.next_action),
  };
}
