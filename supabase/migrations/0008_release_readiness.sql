-- Release readiness consolidation.
-- Makes the Next website/admin database dependencies reproducible from the
-- ordered migrations and standardizes XP math at 10 XP / 100 XP per level.

-- Admin runtime tables ------------------------------------------------------

create table if not exists public.feature_flags (
  key         text primary key,
  name        text not null,
  description text,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table if not exists public.suggested_habits (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  icon        text not null default 'star',
  enabled     boolean not null default true,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  admin_email   text not null,
  action        text not null,
  resource_type text,
  resource_id   text,
  details       jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists public.global_notifications (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  type       text not null default 'info'
             check (type in ('info', 'warning', 'success')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table public.profiles add column if not exists is_pro boolean not null default false;
alter table public.profiles add column if not exists platform text;

alter table public.feature_flags        enable row level security;
alter table public.suggested_habits     enable row level security;
alter table public.admin_audit_log      enable row level security;
alter table public.global_notifications enable row level security;

drop policy if exists "auth read feature_flags" on public.feature_flags;
create policy "auth read feature_flags"
  on public.feature_flags for select to authenticated using (true);

drop policy if exists "auth read suggested_habits" on public.suggested_habits;
create policy "auth read suggested_habits"
  on public.suggested_habits for select to authenticated using (true);

drop policy if exists "auth read global_notifications" on public.global_notifications;
create policy "auth read global_notifications"
  on public.global_notifications for select to authenticated
  using (active = true and (expires_at is null or expires_at > now()));

create index if not exists suggested_habits_enabled_sort_idx
  on public.suggested_habits(enabled, sort_order, created_at);

create index if not exists global_notifications_active_created_idx
  on public.global_notifications(active, created_at desc);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);

insert into public.feature_flags (key, name, description, enabled) values
  ('maintenance_mode',    'Maintenance Mode',      'Show a "Coming Back Soon" screen to all users during downtime', false),
  ('leaderboard',         'Leaderboard',           'Enable the public competitive leaderboard', true),
  ('achievements',        'Achievements & Badges', 'Enable the XP, level, and badge system', true),
  ('social_feed',         'Social Feed',           'Enable public activity sharing and community feeds', false),
  ('ai_suggestions',      'AI Habit Suggestions',  'Enable AI-powered personalised habit suggestions', false),
  ('push_notifications',  'Push Notifications',    'Enable sending push notifications to mobile devices', true)
on conflict (key) do nothing;

insert into public.suggested_habits (name, description, icon, sort_order) values
  ('Drink Water',   'Stay hydrated - drink 8 glasses daily',        'water_drop',       1),
  ('Morning Walk',  'Start your day with a refreshing walk outside', 'directions_walk',  2),
  ('Read',          'Read for at least 20 minutes every day',        'menu_book',        3),
  ('Meditate',      'Practice mindfulness - even 5 minutes counts',  'self_improvement', 4),
  ('Exercise',      'Get your daily workout in',                    'fitness_center',   5),
  ('Sleep Early',   'Get to bed by 10 pm for better rest',          'bedtime',          6),
  ('Journal',       'Reflect on your day in writing',               'edit_note',        7),
  ('No Sugar',      'Avoid sugary foods and drinks today',          'nutrition',        8),
  ('Cold Shower',   'Build resilience with a cold shower',          'shower',           9),
  ('Gratitude',     'Write down 3 things you are grateful for',     'favorite',         10)
on conflict do nothing;

-- Public profile display view ----------------------------------------------

drop view if exists public.public_profiles;
create view public.public_profiles
as
select
  user_id,
  display_name,
  avatar_style,
  avatar_seed
from public.profiles
where display_name is not null;

grant select on public.public_profiles to authenticated;

-- Canonical public leaderboard view ----------------------------------------

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

-- Period leaderboard RPC used by the Next website --------------------------

create or replace function public.get_leaderboard(period text default 'all')
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  xp bigint,
  streak int,
  is_current_user boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_start_date date;
begin
  v_start_date := case
    when period = 'week' then current_date - interval '7 days'
    when period = 'month' then current_date - interval '30 days'
    else '1970-01-01'::date
  end;

  return query
  with user_xp as (
    select
      hc.user_id,
      count(*)::bigint * 10 as xp
    from public.habit_completions hc
    where hc.completed_on >= v_start_date
    group by hc.user_id
  ),
  user_streak as (
    select
      hc.user_id,
      count(distinct hc.completed_on)::int as streak
    from public.habit_completions hc
    where hc.completed_on >= current_date - interval '60 days'
      and hc.completed_on <= current_date
      and not exists (
        select 1
        from generate_series(
          hc.completed_on + 1,
          current_date,
          interval '1 day'
        ) gs(d)
        where gs.d::date not in (
          select distinct completed_on
          from public.habit_completions hc2
          where hc2.user_id = hc.user_id
        )
      )
    group by hc.user_id
  )
  select
    row_number() over (order by ux.xp desc)::bigint as rank,
    ux.user_id,
    p.display_name,
    ux.xp,
    coalesce(us.streak, 0)::int as streak,
    (ux.user_id = v_user_id) as is_current_user
  from user_xp ux
  join public.profiles p on p.user_id = ux.user_id and p.display_name is not null
  left join user_streak us on us.user_id = ux.user_id
  order by ux.xp desc
  limit 50;
end;
$$;

grant execute on function public.get_leaderboard(text) to authenticated;
