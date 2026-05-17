-- HabitApp schema. Run this in the Supabase SQL editor for your project.
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE / IF EXISTS.

create extension if not exists "pgcrypto";

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  icon        text not null default 'spa',
  color       text not null default 'primary'
              check (color in ('primary', 'secondary', 'tertiary', 'neutral')),
  target      numeric,
  unit        text,
  reminder_time time,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists habits_user_id_idx on public.habits(user_id);

-- Newer columns: multi-time reminders + day-of-week filter (existing rows keep
-- their single reminder_time column for backward compatibility).
alter table public.habits add column if not exists reminder_times text[] default '{}'::text[];
alter table public.habits add column if not exists reminder_days  int[]  default '{0,1,2,3,4,5,6}'::int[];
alter table public.habits add column if not exists reminders_enabled boolean default false;
alter table public.habits add column if not exists habit_type text default 'custom';
alter table public.habits add column if not exists metric_type text default 'boolean';
alter table public.habits add column if not exists visual_type text default 'progress_ring';
alter table public.habits add column if not exists reminder_strategy text default 'manual';
alter table public.habits add column if not exists reminder_interval_minutes int;
alter table public.habits add column if not exists default_log_value numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'habits_habit_type_check'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits add constraint habits_habit_type_check
      check (habit_type in ('water_intake', 'walk', 'sleep', 'read', 'run', 'cycling', 'meditate', 'workout', 'journal', 'vitamins', 'healthy_eating', 'cold_shower', 'no_social_media', 'coding', 'stretch', 'cooking', 'custom'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'habits_metric_type_check'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits add constraint habits_metric_type_check
      check (metric_type in ('volume_ml', 'steps', 'hours', 'pages', 'minutes', 'distance_km', 'boolean'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'habits_visual_type_check'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits add constraint habits_visual_type_check
      check (visual_type in ('water_bottle', 'step_path', 'sleep_moon', 'reading_book', 'progress_ring'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'habits_reminder_strategy_check'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits add constraint habits_reminder_strategy_check
      check (reminder_strategy in ('manual', 'interval', 'conditional_interval'));
  end if;
end $$;

create table if not exists public.habit_completions (
  id            uuid primary key default gen_random_uuid(),
  habit_id      uuid not null references public.habits(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  completed_on  date not null default current_date,
  value         numeric,
  note          text,
  created_at    timestamptz not null default now(),
  unique (habit_id, completed_on)
);

create index if not exists completions_user_date_idx
  on public.habit_completions(user_id, completed_on);

create table if not exists public.sleep_entries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  sleep_date       date not null,
  source           text not null
                   check (source in ('healthConnect', 'healthKit', 'manual')),
  duration_minutes int not null check (duration_minutes >= 0 and duration_minutes <= 1440),
  score            int not null check (score >= 0 and score <= 100),
  start_time       timestamptz,
  end_time         timestamptz,
  stage_minutes    jsonb,
  source_metadata  jsonb not null default '{}'::jsonb,
  synced_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, sleep_date)
);

create index if not exists sleep_entries_user_date_idx
  on public.sleep_entries(user_id, sleep_date desc);

-- Row Level Security
alter table public.habits enable row level security;
alter table public.habit_completions enable row level security;
alter table public.sleep_entries enable row level security;

grant select, insert, update, delete on table public.sleep_entries to authenticated;

drop policy if exists "habits: owner read" on public.habits;
create policy "habits: owner read"
  on public.habits for select
  using (auth.uid() = user_id);

drop policy if exists "habits: owner insert" on public.habits;
create policy "habits: owner insert"
  on public.habits for insert
  with check (auth.uid() = user_id);

drop policy if exists "habits: owner update" on public.habits;
create policy "habits: owner update"
  on public.habits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "habits: owner delete" on public.habits;
create policy "habits: owner delete"
  on public.habits for delete
  using (auth.uid() = user_id);

drop policy if exists "completions: owner read" on public.habit_completions;
create policy "completions: owner read"
  on public.habit_completions for select
  using (auth.uid() = user_id);

drop policy if exists "completions: owner insert" on public.habit_completions;
create policy "completions: owner insert"
  on public.habit_completions for insert
  with check (auth.uid() = user_id);

drop policy if exists "completions: owner delete" on public.habit_completions;
create policy "completions: owner delete"
  on public.habit_completions for delete
  using (auth.uid() = user_id);

drop policy if exists "completions: owner update" on public.habit_completions;
create policy "completions: owner update"
  on public.habit_completions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sleep_entries: owner read" on public.sleep_entries;
create policy "sleep_entries: owner read"
  on public.sleep_entries for select
  using ((select auth.uid()) = user_id);

drop policy if exists "sleep_entries: owner insert" on public.sleep_entries;
create policy "sleep_entries: owner insert"
  on public.sleep_entries for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "sleep_entries: owner update" on public.sleep_entries;
create policy "sleep_entries: owner update"
  on public.sleep_entries for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "sleep_entries: owner delete" on public.sleep_entries;
create policy "sleep_entries: owner delete"
  on public.sleep_entries for delete
  using ((select auth.uid()) = user_id);
