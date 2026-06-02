-- Publish readiness: account deletion requests + leaderboard aggregate fix.

create table if not exists public.account_deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  email        text,
  reason       text,
  status       text not null default 'requested'
               check (status in ('requested', 'processing', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists account_deletion_requests_user_id_idx
  on public.account_deletion_requests(user_id);

alter table public.account_deletion_requests enable row level security;

drop policy if exists "deletion requests: owner insert" on public.account_deletion_requests;
create policy "deletion requests: owner insert"
  on public.account_deletion_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "deletion requests: owner read" on public.account_deletion_requests;
create policy "deletion requests: owner read"
  on public.account_deletion_requests for select
  using (auth.uid() = user_id);

-- Keep public leaderboard rows opt-in, but aggregate all opted-in users' totals.
-- The view intentionally exposes only profile display fields and aggregate counts.
create or replace view public.leaderboard
as
select
  p.user_id,
  p.display_name,
  p.avatar_style,
  p.avatar_seed,
  coalesce(c.total_completions, 0) as total_completions,
  coalesce(c.total_completions, 0) * 10 as total_xp,
  (coalesce(c.total_completions, 0) * 10) / 100 + 1 as level,
  coalesce(h.total_habits, 0) as total_habits,
  coalesce(c.last_completion_date, null) as last_completion_date
from public.profiles p
left join lateral (
  select count(*)::int as total_completions, max(completed_on) as last_completion_date
  from public.habit_completions
  where user_id = p.user_id
) c on true
left join lateral (
  select count(*)::int as total_habits
  from public.habits
  where user_id = p.user_id and archived_at is null
) h on true
where p.display_name is not null;

grant select on public.leaderboard to authenticated;

create or replace function public.valid_reminder_times(times text[])
returns boolean
language sql
immutable
as $$
  select times is null or coalesce(bool_and(value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), true)
  from unnest(times) as t(value)
$$;

alter table public.habits
  drop constraint if exists habits_target_positive,
  add constraint habits_target_positive check (target is null or target > 0);

alter table public.habits
  drop constraint if exists habits_reminder_days_valid,
  add constraint habits_reminder_days_valid
  check (reminder_days is null or reminder_days <@ array[0,1,2,3,4,5,6]::int[]);

alter table public.habits
  drop constraint if exists habits_reminder_times_valid,
  add constraint habits_reminder_times_valid
  check (public.valid_reminder_times(reminder_times));

alter table public.habit_completions
  drop constraint if exists completions_value_positive,
  add constraint completions_value_positive check (value is null or value > 0);
