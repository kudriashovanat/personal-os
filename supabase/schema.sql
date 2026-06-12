-- Personal OS · схема Supabase
-- Принцип: Obsidian — источник истины для знаний и заметок.
-- Supabase хранит оперативные данные интерфейса (задачи, статусы, журнал).

create extension if not exists "pgcrypto";

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Главное',
  priority int not null default 2 check (priority between 1 and 3),
  status text not null default 'todo' check (status in ('todo','doing','done')),
  quadrant text check (quadrant in ('q1','q2','q3','q4')),
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists quick_notes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  note_type text not null default 'Мысль',
  created_at timestamptz not null default now()
);

create table if not exists gratitude_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null unique,
  grateful_for text,
  grateful_to text,
  best_moment text,
  went_well text,
  went_wrong text,
  learned text,
  improve text,
  mood int check (mood between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists content_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text not null default 'Telegram' check (platform in ('Telegram','LinkedIn')),
  topic text,
  hook text,
  series text,
  status text not null default 'идея' check (status in ('идея','черновик','готово','опубликовано')),
  created_at timestamptz not null default now()
);

create table if not exists career_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text,
  link text,
  bucket text not null default 'Высокий приоритет'
    check (bucket in ('Высокий приоритет','Вход на рынок Израиля','Пограничные варианты')),
  country text,
  remote boolean default false,
  level text,
  language text,
  hebrew_required boolean default false,
  status text not null default 'посмотреть'
    check (status in ('посмотреть','откликнуться','откликнулась','пропустить')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  horizon text not null default 'месяц'
    check (horizon in ('месяц','квартал','год','3 года','10 лет')),
  status text not null default 'в работе' check (status in ('в работе','достигнута','отложена')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  circle text not null default 'коллеги'
    check (circle in ('друзья','коллеги','рекрутеры','полезные знакомства')),
  last_contact date,
  remind_after_days int,
  notes text,
  created_at timestamptz not null default now()
);

-- Безопасность: включаем RLS без политик — анонимный ключ не имеет доступа.
-- Приложение работает только через service-role ключ на сервере.
alter table tasks enable row level security;
alter table quick_notes enable row level security;
alter table gratitude_entries enable row level security;
alter table content_ideas enable row level security;
alter table career_items enable row level security;
alter table goals enable row level security;
alter table contacts enable row level security;
