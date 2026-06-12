# Personal OS — контекст для Claude Code

## Что это
Личный закрытый дашборд Натальи (Next.js 14 App Router, TypeScript, Tailwind, NextAuth, Supabase, Google Calendar/Drive REST). Интерфейс на русском. Главный принцип: **Obsidian-first** — знания живут в Obsidian Vault (синхронизирован с Google Drive), сайт лишь интерфейс. При конфликте сайт ↔ Obsidian истина всегда в Obsidian.

## Жёсткие правила
1. НИКОГДА не удалять заметки в Obsidian/Drive автоматически — только после явного подтверждения в UI.
2. НИКОГДА не создавать события в Google Calendar без подтверждения — только через pending-механику (предложение → кнопка «Добавить»).
3. Секреты только в env. Supabase service-role ключ — только в server-коде (`lib/supabase.ts`), никогда в клиенте.
4. Дизайн-система не ломается: фон #F6F6F9, glassmorphism (`.glass`, `.glass-strong` в globals.css), шрифты Playfair Display (заголовки, класс `font-display`) + Manrope (текст), пастельная палитра в tailwind.config.ts (iris/sage/peach/sky/rose/butter + *-soft). Не превращать в админку.
5. Русский интерфейс, идеальный мобайл (нижнее меню в AppShell).

## Архитектура (как уже сделано)
- `lib/auth.ts` — NextAuth, Google provider, allowlist по `ALLOWED_EMAILS`, scopes calendar.readonly + calendar.events + drive.file, refresh-токены. Access token доступен в session.
- `lib/google.ts` — REST-вызовы Calendar и Drive (multipart upload .md в `OBSIDIAN_INBOX_FOLDER_ID`).
- `lib/supabase.ts` — ленивый server-клиент (service role). RLS включён без политик.
- `app/api/collection/[table]` — универсальный CRUD с белым списком таблиц.
- `components/QuickNote.tsx` — FAB на всех страницах, типы заметок, detectDateTime → подсказка про календарь (без автодобавления).
- Заглушки с описанием: `/trends`, `/brain`, `/graph`, `/files` (компонент `Upcoming`).

## БЛОК 2 — Second Brain + календарь-расширение
1. **Чтение Vault через Drive API** (`lib/google.ts` дополнить):
   - env `OBSIDIAN_VAULT_FOLDER_ID` (корень Vault),
   - listFiles рекурсивно по папкам (mimeType text/markdown), files.get для содержимого,
   - кэш списка в Supabase (таблица `vault_index`: path, drive_id, title, tags, mtime) с инкрементальным обновлением по modifiedTime.
   - ВНИМАНИЕ: scope `drive.file` не видит чужие файлы — для чтения Vault добавить scope `drive.readonly` в `lib/auth.ts` (пользователь перелогинится).
2. **Страница /brain**: последние заметки, Inbox, поиск (по vault_index + полнотекст в Supabase), фильтр по тегам, просмотр markdown (react-markdown + remark-gfm), бережный рендер wiki-ссылок `[[...]]`.
3. **Обработка Inbox**: перемещение заметки в заранее определённые папки (whitelist в env `OBSIDIAN_FOLDERS_MAP`, JSON name→folderId) через files.update parents. Удаление — только с confirm-диалогом.
4. **Daily Notes / Weekly Review**: кнопки «Создать Daily Note» (шаблон с задачами дня и благодарностью) и «Weekly Review».
5. **Pending calendar requests**: таблица `calendar_requests` (title, start, end, source, status pending/added/declined); QuickNote при дате создаёт pending; на /calendar блок «Ожидают подтверждения» с кнопками Добавить (POST events) / Отклонить.

## БЛОК 3 — Агенты + File Upload
1. **Agents Center**: таблица `agent_runs` (agent, status, started_at, finished_at, error, report jsonb). Endpoint `POST /api/agents/[name]/report` с секретом `AGENT_WEBHOOK_SECRET` в заголовке — внешние агенты (n8n / cron / Claude API) пушат результаты. UI: статус, последний запуск, ошибки, отчёт.
2. **HR Trends** (`/trends`): таблица `trends` (title, summary, source_url, signal, applied_idea, created_at). Кнопка «→ в Content Studio» создаёт content_idea со ссылкой на тренд. Источник данных: агент через webhook ИЛИ серверный route с Anthropic API + web search (ключ `ANTHROPIC_API_KEY`).
3. **File Upload Center** (`/files`):
   - env `UPLOADS_FOLDER_ID` (папка «Personal OS Uploads» в Drive),
   - upload через Drive multipart (resumable для >5MB),
   - извлечение текста: pdf-parse / mammoth (docx) / xlsx — серверно,
   - краткое содержание через Anthropic API,
   - карточка в Obsidian: .md в Inbox со ссылкой на Drive, метаданными, summary,
   - связь с заметками: поле «связать с» (поиск по vault_index).
4. **Content Ideas agent**: генерация идей из трендов + заметок, статус «идея», в Content Studio.

## БЛОК 4 — Knowledge Graph
- `/graph`: d3-force (или react-force-graph) по vault_index: ноды = заметки/люди/компании/проекты (по тегам и папкам), рёбра = wiki-ссылки `[[...]]` (парсить при индексации в Блоке 2, таблица `vault_links`).
- Фильтры по типу ноды, клик → предпросмотр заметки, переход в /brain.
- Мобайл: упрощённый режим (топ-связи списком).

## Команды
- `npm run dev` / `npm run build`
- Перед коммитом: `npm run build` должен проходить без ошибок.
