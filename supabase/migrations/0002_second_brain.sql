-- ============================================================================
-- Personal OS · Second Brain persistence — миграция 0002
-- ----------------------------------------------------------------------------
-- Указатели на markdown-артефакт в Drive (план знаний). Supabase остаётся
-- каноном состояния/статуса, drive_id/drive_link ссылаются на канонический
-- .md-файл в Second Brain. Идемпотентно, безопасно к данным.
-- ============================================================================

alter table trends        add column if not exists drive_id   text;
alter table trends        add column if not exists drive_link text;

alter table content_ideas add column if not exists drive_id   text;
alter table content_ideas add column if not exists drive_link text;

-- career_items уже расширен в 0001; инсайты Career проецируются позже (Strategist).
