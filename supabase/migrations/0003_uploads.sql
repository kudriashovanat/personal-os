-- ============================================================================
-- Personal OS · File Upload Center — миграция 0003
-- ----------------------------------------------------------------------------
-- Индекс загруженных файлов (план состояния). Сам файл канонично живёт в Drive
-- (Personal OS Uploads), карточка-знание — в Obsidian Inbox; здесь — указатели
-- и краткое содержание для интерфейса. Идемпотентно, RLS как у остальных.
-- ============================================================================

create table if not exists uploads (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  mime            text,
  size            bigint,
  drive_id        text,        -- файл в Drive (Uploads)
  drive_link      text,
  inbox_drive_id  text,        -- карточка .md в Obsidian Inbox
  summary         text,
  extracted_chars int,
  created_at      timestamptz not null default now()
);
create index if not exists uploads_created_idx on uploads (created_at desc);

alter table uploads enable row level security;
