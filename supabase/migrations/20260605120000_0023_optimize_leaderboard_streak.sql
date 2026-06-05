-- Optimize the leaderboard current-streak calculation.
--
-- The original get_leaderboard_entries computed each user's streak with a
-- correlated generate_series that, for every completion in the last 60 days,
-- probed `not in (select distinct completed_on ... full history)`. That is
-- roughly O(users x completions x days) and runs for every opted-in profile.
--
-- Replace it with a gap-and-island calculation: consecutive distinct completion
-- days share (completed_on - row_number) as a constant key, so the current
-- streak is simply the size of the island that contains today. Same semantics
-- (length of the unbroken run of completed days ending on current_date, 0 if
-- today is not completed, capped at the 60-day window), at O(n log n).

create or replace function public.get_leaderboard_entries(
  p_period text default 'all',
  p_limit integer default 50,
  p_current_user_id uuid default null
)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  avatar_style text,
  avatar_seed text,
  total_completions integer,
  total_xp bigint,
  level integer,
  total_habits integer,
  last_completion_date date,
  xp bigint,
  streak integer,
  is_current_user boolean
)
language sql
set search_path to public, pg_temp
as $$
  with params as (
    select
      case
        when p_period = 'week' then current_date - 7
        when p_period = 'month' then current_date - 30
        else '1970-01-01'::date
      end as start_date,
      case
        when p_period in ('week', 'month', 'all') then p_period
        else 'all'
      end as safe_period,
      greatest(1, least(coalesce(p_limit, 50), 100)) as safe_limit
  ),
  completion_totals as (
    select
      hc.user_id,
      count(*)::integer as total_completions,
      max(hc.completed_on) as last_completion_date
    from public.habit_completions hc
    where hc.completed_on >= (select start_date from params)
    group by hc.user_id
  ),
  habit_totals as (
    select
      h.user_id,
      count(*)::integer as total_habits
    from public.habits h
    where h.archived_at is null
    group by h.user_id
  ),
  -- Distinct completed days per user within the streak window.
  distinct_days as (
    select distinct hc.user_id, hc.completed_on
    from public.habit_completions hc
    where hc.completed_on >= current_date - 60
      and hc.completed_on <= current_date
  ),
  -- Consecutive days share a constant island key (date - running row number).
  day_islands as (
    select
      dd.user_id,
      dd.completed_on,
      dd.completed_on
        - (row_number() over (partition by dd.user_id order by dd.completed_on))::integer
        as island_key
    from distinct_days dd
  ),
  -- The island that contains today is the current streak's run.
  current_islands as (
    select user_id, island_key
    from day_islands
    where completed_on = current_date
  ),
  streak_totals as (
    select di.user_id, count(*)::integer as streak
    from day_islands di
    join current_islands ci
      on ci.user_id = di.user_id
      and ci.island_key = di.island_key
    group by di.user_id
  ),
  leaderboard_rows as (
    select
      p.user_id,
      p.display_name,
      p.avatar_style,
      p.avatar_seed,
      coalesce(ct.total_completions, 0)::integer as total_completions,
      (coalesce(ct.total_completions, 0)::bigint * 10) as total_xp,
      (((coalesce(ct.total_completions, 0)::bigint * 10) / 500) + 1)::integer as level,
      coalesce(ht.total_habits, 0)::integer as total_habits,
      ct.last_completion_date,
      coalesce(st.streak, 0)::integer as streak
    from public.profiles p
    left join completion_totals ct on ct.user_id = p.user_id
    left join habit_totals ht on ht.user_id = p.user_id
    left join streak_totals st on st.user_id = p.user_id
    where p.display_name is not null
      and (
        (select safe_period from params) = 'all'
        or coalesce(ct.total_completions, 0) > 0
      )
  ),
  ranked as (
    select
      row_number() over (order by lr.total_xp desc, lr.display_name asc, lr.user_id asc)::bigint as rank,
      lr.user_id,
      lr.display_name,
      lr.avatar_style,
      lr.avatar_seed,
      lr.total_completions,
      lr.total_xp,
      lr.level,
      lr.total_habits,
      lr.last_completion_date,
      lr.total_xp as xp,
      lr.streak,
      (lr.user_id = p_current_user_id) as is_current_user
    from leaderboard_rows lr
  )
  select *
  from ranked
  order by rank
  limit (select safe_limit from params);
$$;

-- create or replace preserves privileges, but keep the service-only boundary
-- explicit and self-documenting.
revoke execute on function public.get_leaderboard_entries(text, integer, uuid) from public;
revoke execute on function public.get_leaderboard_entries(text, integer, uuid) from anon;
revoke execute on function public.get_leaderboard_entries(text, integer, uuid) from authenticated;
grant execute on function public.get_leaderboard_entries(text, integer, uuid) to service_role;
