-- ============================================================================
-- Personal OS · Planner — пользовательские фильтры — миграция 0008
-- ----------------------------------------------------------------------------
-- Фильтр = сущность пользователя (имя + цвет), а не захардкоженный список.
-- task.category хранит имя фильтра. Сидим текущими категориями, чтобы не
-- осиротить существующие задачи. Идемпотентно, RLS как у остальных.
-- ============================================================================

create table if not exists task_filters (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text not null default '#7C6FE4',
  created_at timestamptz not null default now()
);

insert into task_filters (name, color) values
  ('Главное',      '#7C6FE4'),
  ('Работа',       '#5E8FC9'),
  ('Поиск работы', '#7FA877'),
  ('Контент',      '#E2906B'),
  ('Личное',       '#D2738F')
on conflict (name) do nothing;

alter table task_filters enable row level security;
