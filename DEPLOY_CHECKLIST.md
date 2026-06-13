# Развёртывание — чек-лист

Всё новое **additive и прод-безопасно**: без env-переменных функции тихо деградируют (Supabase работает, проекция в Drive / Telegram просто пропускается), без миграций новые поля просто пустые. Поэтому шаги можно делать по частям.

## 1. Зависимости

```bash
npm install
```
Добавлены: `pdf-parse`, `mammoth`, `xlsx` (извлечение текста из файлов).

## 2. Миграции (Supabase → SQL Editor, по порядку)

Запускать вручную, ревьюить перед применением. Все идемпотентны и безопасны к данным.

- [ ] `supabase/migrations/0001_career_crm.sql` — Career CRM: расширение `career_items`, новый CHECK на `status`, таблицы `profile` / `career_status_history` / `interviews` / `interview_analyses` / `rejections`, триггер истории статусов.
- [ ] `supabase/migrations/0002_second_brain.sql` — указатели `drive_id` / `drive_link` в `trends` и `content_ideas`.
- [ ] `supabase/migrations/0003_uploads.sql` — таблица `uploads` (индекс загруженных файлов).
- [ ] `supabase/migrations/0004_learning.sql` — таблица `learning_items` (карточки English/Hebrew с SRS).
- [ ] `supabase/migrations/0005_interview_drive.sql` — `drive_id`/`drive_link` на `interview_analyses` (Debrief → Drive).

## 3. Переменные окружения

Перенеси нужное из `.env.example` в `.env.local` (локально) и в Vercel (прод).

| Переменная | Зачем | Без неё |
|---|---|---|
| `SB_HR_TRENDS_FOLDER_ID` | папка `SecondBrain/HR Trends` в Drive | тренды не проецируются в Drive |
| `SB_CONTENT_FOLDER_ID` | папка `SecondBrain/Content Ideas` | идеи/черновики не проецируются |
| `SB_CAREER_FOLDER_ID` | папка `SecondBrain/Career` | career-инсайты не проецируются (позже) |
| `UPLOADS_FOLDER_ID` | папка «Personal OS Uploads» | загрузка файлов вернёт ошибку |
| `TELEGRAM_BOT_TOKEN` | бот от @BotFather | кнопка «В Telegram» вернёт ошибку |
| `TELEGRAM_CHAT_ID` | твой chat id (@userinfobot) | то же |
| `AGENT_CRON_SECRET` | секрет для cron-роутов `/api/cron/[agent]` | автозапуск отключён (понятная ошибка 503) |
| `CRON_SECRET` | тем же значением — Vercel Cron шлёт его в Authorization | Vercel-cron не пройдёт проверку |

### Автозапуск агентов (Vercel Cron)

`vercel.json` уже задаёт расписание (время **UTC**; указано ≈ для Израиля летом, UTC+3):

- `0 5 * * *` → ~08:00 — Career Search
- `30 5 * * *` → ~08:30 — Career Scoring
- `0 6 * * *` → ~09:00 — HR Trends
- `0 7 * * *` → ~10:00 — Content Ideas

Установи `AGENT_CRON_SECRET` и `CRON_SECRET` (одно значение). Каждый агент — отдельный лёгкий запрос (не два тяжёлых сразу). Автономный запуск пишет в Supabase; Drive-проекция без сессии пропускается (Drive-sync кнопкой — позже). **Лимит Vercel Hobby: 2 cron-джоба, раз в день** — если на Hobby, оставь career-search + career-score, остальные запускай вручную или внешним планировщиком.

> ID папки Drive — из URL после `/folders/`. Папки создай внутри своего Obsidian Vault.

## 4. Профиль (включает AI-функции карьеры)

- [ ] На странице `/профиль` вставить `CV / резюме (текст)`.

Без `cv_text` скоринг вакансий, Positioning Calibrator, Interview Prepare и разбор отказов работают вхолостую (зависимость заложена: «fit_score без профиля = вода»).

## 5. Сборка и деплой

```bash
npm run build   # должен пройти без ошибок (правило из CLAUDE.md)
```
Затем деплой (Vercel).

---

## Что проверить после применения (быстрый smoke-тест)

- [ ] **Career** (`/career`) — Kanban рисуется, легаси-статусы сворачиваются в канон, карточка открывается и редактируется (роль, компания, ссылка, зарплата, контакты).
- [ ] **Quick-add** — вставить ссылку на вакансию → «Заполнить через AI» → поля заполнились.
- [ ] **Скоринг** — запустить Career Search Agent на `/agents`; у новых вакансий появились `fit_score` и `level_match` (после заполнения `cv_text`).
- [ ] **Аналитика** (`/career` → «Аналитика») — метрики, слой выводов, «Сделать сегодня», остывшие заявки.
- [ ] **Calibrate / Документы / Prepare / Отказ** в drawer карточки — отдают результат (или понятную ошибку 412, если нет `cv_text`).
- [ ] **Planner** (`/planner`) — невыполненные задачи с прошлых дней показываются с бейджем «перенесена».
- [ ] **Files** (`/files`) — загрузка файла → ссылка на Drive + summary + карточка в Obsidian Inbox.
- [ ] **Content** (`/content`) — кнопка ✈️ присылает черновик поста в Telegram.
- [ ] **HR Trends / Content Ideas** — после запуска агента в карточках есть ссылка «Second Brain» (если заданы `SB_*` папки).
- [ ] **Дизайн** — светлый mesh-фон «дышит», стекло прозрачное, шрифт Sora.

## Источник правды (памятка по архитектуре)

- **Знания / артефакты** (заметки, тренды, черновики, инсайты, файлы) — канон в **Obsidian Vault на Google Drive** (`.md`). Supabase хранит указатель `drive_id`.
- **Живое состояние** (статусы задач, стадии Kanban, career-пайплайн, журнал агентов) — канон в **Supabase**.
- Правило: у каждого факта один владелец. Контент → Drive; статус → Supabase.

## Известные ограничения v1

- Загрузка файлов — до **4 MB** (лимит тела serverless). Больше — нужен resumable upload (отдельный шаг).
- Проекция результатов агентов в Drive работает на **ручном запуске с дашборда** (использует токен сессии). Автономные (cron/webhook) пишут только в Supabase — синхронизация в Drive отдельной кнопкой запланирована.
- Career Strategist (прогон по всей истории, opus) — по плану включается после ~15–20 точек данных.
