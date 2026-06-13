-- ============================================================================
-- Personal OS · Learning OS — миграция 0004
-- ----------------------------------------------------------------------------
-- Карточки изучения языков (English C2 / Hebrew) с интервальным повторением
-- (Leitner SRS). Это операционные данные интерфейса → канон в Supabase.
-- Идемпотентно, RLS как у остальных таблиц.
-- ============================================================================

create table if not exists learning_items (
  id              uuid primary key default gen_random_uuid(),
  language        text not null,            -- 'en' | 'he' (канон в коде, lib/learning.ts)
  term            text not null,
  translation     text,                     -- перевод на русский
  transliteration text,                     -- для иврита
  part_of_speech  text,
  example         text,
  note            text,                     -- нюанс/регистр/HR-контекст
  category        text,                     -- hr | interview | general | everyday
  level           text,                     -- C1 | C2 | A1 ...
  -- SRS (Leitner): box 0..6, due_date — когда показать на повтор
  box             smallint not null default 0,
  due_date        date not null default current_date,
  reviews         int not null default 0,
  lapses          int not null default 0,
  last_reviewed   timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists learning_items_lang_due_idx on learning_items (language, due_date);
create index if not exists learning_items_created_idx on learning_items (created_at desc);

alter table learning_items enable row level security;
