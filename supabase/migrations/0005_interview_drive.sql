-- ============================================================================
-- Personal OS · Interview Debrief → Second Brain — миграция 0005
-- ----------------------------------------------------------------------------
-- Указатель на markdown-разбор интервью в Drive (SecondBrain/Career), чтобы не
-- потерять выводы. Канон разбора — Supabase; .md — человекочитаемая копия.
-- Идемпотентно.
-- ============================================================================

alter table interview_analyses add column if not exists drive_id   text;
alter table interview_analyses add column if not exists drive_link text;
