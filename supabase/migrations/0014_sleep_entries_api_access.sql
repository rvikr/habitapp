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

alter table public.sleep_entries enable row level security;

grant select, insert, update, delete on table public.sleep_entries to authenticated;

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
