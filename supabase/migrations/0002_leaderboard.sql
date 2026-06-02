-- Leaderboard support: profiles (opt-in display name) + a public stats view.
-- Users only appear on the leaderboard once they set a display_name.

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_style text,
  avatar_seed  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists profiles_display_name_idx on public.profiles(display_name);

alter table public.profiles enable row level security;

drop policy if exists "profiles: anyone read named" on public.profiles;
create policy "profiles: anyone read named"
  on public.profiles for select
  using (display_name is not null);

drop policy if exists "profiles: owner read self" on public.profiles;
create policy "profiles: owner read self"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles: owner upsert" on public.profiles;
create policy "profiles: owner upsert"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "profiles: owner update" on public.profiles;
create policy "profiles: owner update"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public leaderboard view: aggregates stats per opted-in user.
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

-- Auto-create a profile row on signup so the user can later set a display_name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
