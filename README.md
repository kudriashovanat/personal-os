# Personal OS

Личный закрытый центр управления жизнью, карьерой, знаниями и контентом.
Принцип: **Obsidian-first** — знания живут в вашем Obsidian Vault (синхронизированном с Google Drive), сайт — интерфейс поверх данных.

---

## Что уже работает (Блок 1)

| Раздел | Статус |
|---|---|
| Today Dashboard — фокус дня, 3 приоритета, прогресс, ближайшее событие | ✅ |
| Daily Planner — категории, приоритеты, статусы, сортировка | ✅ |
| Матрица Эйзенхауэра — drag & drop, связь с задачами | ✅ |
| Calendar — чтение Google Calendar, день / неделя / timeline | ✅ |
| Career — вакансии, категории, статусы, фильтры, пометка по ивриту | ✅ |
| Content Studio — Telegram / LinkedIn, хуки, серии, статусы | ✅ |
| Gratitude & Reflection — благодарность, рефлексия, streak, настроение | ✅ |
| Goals — 5 горизонтов | ✅ |
| Personal CRM — круги общения, «пора связаться» | ✅ |
| Quick Note на каждой странице → .md в Obsidian Inbox через Google Drive | ✅ |
| Google Login (только ваш email), запрет индексации, защита всех страниц | ✅ |
| HR Trends, Second Brain, Knowledge Graph, Agents, File Upload | 🔜 Блоки 2–4 (план в `CLAUDE.md`) |

---

## 1. Запуск локально

```bash
npm install
cp .env.example .env.local   # заполнить переменные (см. ниже)
npm run dev                  # http://localhost:3000
```

Production-сборка: `npm run build && npm start`.

## 2. Переменные окружения

| Переменная | Что это | Где взять |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID | Google Cloud Console (шаг 4) |
| `GOOGLE_CLIENT_SECRET` | OAuth secret | там же |
| `NEXTAUTH_SECRET` | подпись сессий | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | адрес сайта | `http://localhost:3000` локально, `https://<проект>.vercel.app` на Vercel |
| `ALLOWED_EMAILS` | кто может войти | ваш Gmail (можно несколько через запятую) |
| `SUPABASE_URL` | URL проекта | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | server-ключ | там же, **service_role** (никогда не публиковать) |
| `OBSIDIAN_INBOX_FOLDER_ID` | папка Inbox вашего Vault в Drive | шаг 6 |

## 3. Подключение Supabase

1. https://supabase.com → New project (регион Frankfurt — ближе к Израилю).
2. SQL Editor → вставьте содержимое `supabase/schema.sql` → Run.
3. Settings → API → скопируйте `URL` и `service_role` ключ в `.env.local`.

RLS включён на всех таблицах без политик: публичный anon-ключ ничего не читает, доступ только через server-ключ на сервере Next.js. Это и есть «закрытый доступ».

## 4. Подключение Google OAuth

1. https://console.cloud.google.com → создайте проект «Personal OS».
2. **APIs & Services → OAuth consent screen**: тип External, добавьте свой email в Test users (публиковать приложение не нужно — для личного использования достаточно режима Testing*).
3. **Credentials → Create Credentials → OAuth client ID → Web application**:
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://<ваш-домен>.vercel.app/api/auth/callback/google`
4. Скопируйте Client ID и Secret в `.env.local`.

\* В режиме Testing refresh-токен живёт 7 дней — раз в неделю нужно перелогиниться. Если это неудобно, нажмите «Publish app» (верификация Google для личных scope не обязательна, будет лишь экран предупреждения).

## 5. Подключение Google Calendar

1. В том же проекте Cloud Console: **APIs & Services → Library → Google Calendar API → Enable**.
2. Больше ничего: приложение запрашивает scope `calendar.readonly` и `calendar.events` при входе. Раздел «Календарь» начнёт показывать события сразу после логина.

## 6. Подключение Google Drive (Obsidian-first)

1. **Library → Google Drive API → Enable**.
2. Ваш Obsidian Vault должен синхронизироваться с Google Drive (через приложение «Google Drive для компьютера» — папка Vault лежит внутри «Мой диск»).
3. Откройте в Drive папку `Inbox` вашего Vault → скопируйте ID из URL:
   `https://drive.google.com/drive/folders/`**`<вот-этот-ID>`**
4. Вставьте в `OBSIDIAN_INBOX_FOLDER_ID`.

Теперь каждая «Быстрая заметка» создаёт `.md`-файл прямо в Inbox — через минуту он появляется в Obsidian на Mac. Сайт использует scope `drive.file` (видит только файлы, созданные им самим — максимально безопасный вариант).

**Важно:** приложение никогда не удаляет заметки и не создаёт события в календаре без подтверждения.

## 7. Деплой на Vercel

```bash
npm i -g vercel
vercel        # привязать проект
vercel --prod
```

Или через https://vercel.com → Import Git Repository.

1. В настройках проекта → Environment Variables → добавьте все переменные из шага 2, `NEXTAUTH_URL` = боевой адрес.
2. Добавьте боевой redirect URI в Google Cloud (шаг 4.3).
3. Готово — сайт открывается с iPhone, iPad, Mac; вход только под вашим Google-аккаунтом.

Индексация запрещена на трёх уровнях: HTTP-заголовок `X-Robots-Tag`, meta robots, и сам контент закрыт авторизацией.

## 8. Резервное копирование

- **Знания**: уже в безопасности по построению — Obsidian Vault лежит в Google Drive и на вашем Mac (две копии). Рекомендация: включить Time Machine на Mac — будет третья.
- **Оперативные данные** (задачи, цели, CRM, благодарности) — Supabase:
  - бесплатно вручную: SQL Editor → `select * from tasks` → Export CSV (раз в месяц достаточно);
  - или через CLI: `supabase db dump -f backup.sql`;
  - на платном плане Supabase делает ежедневные бэкапы сам.
- **Код**: запушьте в приватный GitHub-репозиторий.

## 9. Структура проекта

```
app/            страницы (App Router) + API-маршруты
components/     AppShell (навигация), QuickNote, UI-кит
lib/            auth (NextAuth + allowlist), supabase, google (Calendar/Drive REST)
supabase/       schema.sql
middleware.ts   защита всех страниц
CLAUDE.md       план Блоков 2–4 для Claude Code
```

## 10. Продолжение разработки (Блоки 2–4)

Лучший способ — **Claude Code** в папке проекта:

```bash
npm i -g @anthropic-ai/claude-code
cd personal-os
claude
```

Claude Code автоматически прочитает `CLAUDE.md` с контекстом проекта и планом блоков. Просто скажите: «Сделай Блок 2».
