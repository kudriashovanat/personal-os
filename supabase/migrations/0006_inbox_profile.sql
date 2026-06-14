-- ============================================================================
-- Personal OS · Inbox (Capture) + персональное имя — миграция 0006
-- ----------------------------------------------------------------------------
-- profile: имя для приветствия. inbox_items: очередь входящих заметок (статус
-- обработки в Supabase, контент канонично уходит в Drive/Obsidian Inbox).
-- Идемпотентно, RLS как у остальных.
-- ============================================================================

-- Имя пользователя для приветствия (display_name > first_name > Google > 'Наташа')
alter table profile add column if not exists display_name text;
alter table profile add column if not exists first_name   text;
-- Сид для единственного пользователя (если профиль уже есть и имя пустое)
update profile set display_name = 'Наташа' where display_name is null;

-- Входящие заметки (Capture)
create table if not exists inbox_items (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  content     text not null,
  tags        text[] not null default '{}',
  source      text not null default 'manual',   -- manual|telegram|file|idea|note
  status      text not null default 'new',       -- new|processed|archived
  drive_id    text,
  drive_link  text,
  ai_action   text,                              -- task|project|content|note
  ai_reason   text,
  created_at  timestamptz not null default now()
);
create index if not exists inbox_items_status_idx on inbox_items (status, created_at desc);

alter table inbox_items enable row level security;
