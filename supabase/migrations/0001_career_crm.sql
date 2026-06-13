-- ============================================================================
-- Personal OS · Career CRM — Sprint 0 миграция (схема)  [ФИНАЛ]
-- ----------------------------------------------------------------------------
-- Диагностика прода ПРОЙДЕНА (2026-06): схема совпадает со schema.sql,
-- имена констрейнтов career_items_status_check / career_items_bucket_check
-- подтверждены. PK career_items = uuid. Профиля/memory в БД нет.
-- Применяется ВРУЧНУЮ через Supabase SQL Editor; деплой кода — после миграции.
--
-- Свойства: идемпотентна (add column if not exists / create table if not
-- exists / drop ... if exists). Безопасна к существующим данным —
-- деструктивных правок строк нет. PK всех таблиц — uuid (как у career_items).
-- RLS включается без политик, как у существующих таблиц (доступ только через
-- service-role на сервере).
--
-- КЛЮЧЕВОЕ (§11): триггер пишет career_status_history на КАЖДЫЙ переход статуса —
-- это фундамент аналитики воронки и таймингов (см. разбор в чате).
-- ============================================================================


-- ============================================================================
-- §0. ДИАГНОСТИКА — выполнить ОТДЕЛЬНО и прислать вывод ДО применения миграции.
--     (Не часть миграции; закомментировано.)
-- ----------------------------------------------------------------------------
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'career_items' order by ordinal_position;
--
-- select status, count(*) from career_items group by status;   -- реальные статусы в данных
--
-- select conname, pg_get_constraintdef(oid)                     -- реальные имена CHECK-ов
-- from pg_constraint where conrelid = 'career_items'::regclass;
-- ============================================================================


-- ============================================================================
-- §1. career_items.status — заменить CHECK на Kanban-список.
-- ----------------------------------------------------------------------------
-- ВАЖНО: имя констрейнта ниже — стандартное для inline-CHECK из schema.sql.
-- Сверь с выводом 3-го запроса диагностики; если в проде имя другое — замени
-- его в строке DROP CONSTRAINT.
--
-- Новый список = новый Kanban-канон + ВСЕ легаси-значения (чтобы существующие
-- строки остались валидны без правок). Легаси 'посмотреть' маппится на колонку
-- «Новые» НА ЧТЕНИИ в коде — данные не трогаем.
-- Если §0 покажет статусы вне этого списка — добавь их сюда перед применением,
-- иначе ADD CONSTRAINT упадёт.
alter table career_items drop constraint if exists career_items_status_check;
alter table career_items add constraint career_items_status_check check (
  status in (
    -- новый Kanban-канон
    'Новые','Шортлист','Откликнулась','Скрининг','Интервью','Финал','Оффер','Отказ','Архив',
    -- легаси (сохраняем валидность старых строк; маппинг на чтении в коде)
    'посмотреть','откликнуться','откликнулась','пропустить'
  )
);


-- ============================================================================
-- §2. career_items — bucket больше не обязателен.
-- ----------------------------------------------------------------------------
-- Решение: bucket СОХРАНЯЕМ как ручную «категорию/приоритет» рядом с Kanban-
-- статусом (UI на ней уже завязан). Снимаем только NOT NULL, чтобы quick-add и
-- агент могли вставлять строки без bucket. Существующий default остаётся.
alter table career_items alter column bucket drop not null;


-- ============================================================================
-- §3. career_items — новые колонки (Career CRM + Fit Score).
-- ----------------------------------------------------------------------------
-- country переиспользуем как локацию (новую location НЕ заводим). notes уже есть.
alter table career_items add column if not exists source            text;
alter table career_items add column if not exists salary            text;        -- строка; null если не указана (не выдумывать)
alter table career_items add column if not exists fit_score         smallint;    -- 1..10, см. CHECK ниже
alter table career_items add column if not exists fit_reason        text;
alter table career_items add column if not exists fit_risks         text;
alter table career_items add column if not exists to_strengthen     text;
alter table career_items add column if not exists level_match       text;        -- below|at|above, см. CHECK ниже
alter table career_items add column if not exists application_date  date;
alter table career_items add column if not exists recruiter_name    text;
alter table career_items add column if not exists recruiter_email   text;
alter table career_items add column if not exists recruiter_linkedin text;
alter table career_items add column if not exists hiring_manager    text;
alter table career_items add column if not exists next_action       text;
alter table career_items add column if not exists next_action_date  date;
alter table career_items add column if not exists date_found        timestamptz not null default now();
alter table career_items add column if not exists updated_at        timestamptz not null default now();

-- Диапазон fit_score и словарь level_match — стабильные, ставим CHECK.
-- (status оставлен под отдельным CHECK в §1; здесь только новые колонки.)
alter table career_items drop constraint if exists career_items_fit_score_check;
alter table career_items add constraint career_items_fit_score_check
  check (fit_score is null or fit_score between 1 and 10);

alter table career_items drop constraint if exists career_items_level_match_check;
alter table career_items add constraint career_items_level_match_check
  check (level_match is null or level_match in ('below','at','above'));


-- ============================================================================
-- §4. profile — Foundation-сущность (НЕ career_profile). Профиля/memory в БД
--     нет (проверено по коду и schema.sql), поэтому создаём с нуля.
--     Это база для Fit Score: без cv_text скоринг = вода.
-- ----------------------------------------------------------------------------
create table if not exists profile (
  id            uuid primary key default gen_random_uuid(),
  cv_text       text,
  experience    jsonb,
  achievements  jsonb,                 -- STAR-блоки с цифрами
  languages     jsonb,
  location      text,
  target_roles  jsonb,
  target_level  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- ============================================================================
-- §5. career_status_history — источник правды по воронке/времени-в-стадии.
--     Универсальный паттерн «пайплайн со стадиями».
-- ----------------------------------------------------------------------------
create table if not exists career_status_history (
  id              uuid primary key default gen_random_uuid(),
  career_item_id  uuid not null references career_items(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  changed_at      timestamptz not null default now()
);
create index if not exists career_status_history_item_idx
  on career_status_history (career_item_id, changed_at desc);


-- ============================================================================
-- §6. interviews — интервью НА УРОВНЕ РАУНДА (одна вакансия → много раундов).
--     transcript вставляется вручную (готовый текст из TwinMind). Аудио/STT нет.
--     round_type оставлен свободным текстом (канон — в коде), как и status.
-- ----------------------------------------------------------------------------
create table if not exists interviews (
  id              uuid primary key default gen_random_uuid(),
  career_item_id  uuid not null references career_items(id) on delete cascade,
  round_type      text,               -- канон: recruiter|manager|ceo|hrd|final|other (в коде)
  scheduled_at    timestamptz,
  transcript      text,               -- вставляется вручную
  created_at      timestamptz not null default now()
);
create index if not exists interviews_item_idx
  on interviews (career_item_id, created_at desc);


-- ============================================================================
-- §7. interview_analyses — разбор одного раунда (паттерн через несколько
--     интервью собирается на уровне кода/Debrief, тут — по одному раунду).
-- ----------------------------------------------------------------------------
create table if not exists interview_analyses (
  id                   uuid primary key default gen_random_uuid(),
  interview_id         uuid not null references interviews(id) on delete cascade,
  questions            jsonb,
  competency_map       jsonb,
  strengths            text,
  weaknesses           text,
  missed_opportunities text,
  objections           text,
  dimension_scores     jsonb,         -- 8 осей
  recommendations      text,
  model                text,
  created_at           timestamptz not null default now()
);
create index if not exists interview_analyses_interview_idx
  on interview_analyses (interview_id, created_at desc);


-- ============================================================================
-- §8. rejections — захват + классификация отказов.
-- ----------------------------------------------------------------------------
create table if not exists rejections (
  id                 uuid primary key default gen_random_uuid(),
  career_item_id     uuid not null references career_items(id) on delete cascade,
  raw_text           text,
  classified_reasons jsonb,           -- ранжированные вероятные причины
  notes              text,
  created_at         timestamptz not null default now()
);
create index if not exists rejections_item_idx
  on rejections (career_item_id, created_at desc);


-- ============================================================================
-- §9. updated_at — автообновление через триггер (career_items, profile).
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists career_items_set_updated_at on career_items;
create trigger career_items_set_updated_at
  before update on career_items
  for each row execute function set_updated_at();

drop trigger if exists profile_set_updated_at on profile;
create trigger profile_set_updated_at
  before update on profile
  for each row execute function set_updated_at();


-- ============================================================================
-- §10. RLS — те же правила, что у career_items: включить, политик нет.
--      Доступ только через service-role ключ на сервере.
-- ----------------------------------------------------------------------------
alter table profile                enable row level security;
alter table career_status_history  enable row level security;
alter table interviews             enable row level security;
alter table interview_analyses     enable row level security;
alter table rejections             enable row level security;

-- ============================================================================
-- §11. career_status_history — авто-захват КАЖДОГО перехода статуса триггером.
--      Источник правды воронки и таймингов. Триггер гарантирует запись
--      независимо от пути обновления (collection API / агент / будущий код) —
--      этим решается пробел «ручное перемещение в Kanban не пишет историю».
--      ВАЖНО: серверный код больше НЕ должен вставлять историю руками (двойная
--      запись) — вставка убрана из app/api/agents/[id]/run/route.ts.
-- ----------------------------------------------------------------------------
create or replace function log_career_status_change() returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    insert into career_status_history (career_item_id, from_status, to_status)
    values (new.id, null, new.status);
  elsif (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into career_status_history (career_item_id, from_status, to_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists career_items_log_status on career_items;
create trigger career_items_log_status
  after insert or update of status on career_items
  for each row execute function log_career_status_change();

-- Бэкфилл: для уже существующих строк, у которых нет истории, ставим стартовую
-- точку (время = created_at). Идемпотентно — не дублирует.
insert into career_status_history (career_item_id, from_status, to_status, changed_at)
select c.id, null, c.status, coalesce(c.created_at, now())
from career_items c
where not exists (
  select 1 from career_status_history h where h.career_item_id = c.id
);


-- ============================================================================
-- КОНЕЦ. Нормализацию легаси-статусов ('посмотреть' → 'Новые' в данных) НЕ
-- делаем здесь — отдельным шагом. Канон статусов держим в коде (lib/career.ts),
-- легаси сворачивается на чтении (normalizeStatus).
-- ============================================================================
