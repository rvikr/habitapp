-- Service-only leaderboard API used by the leaderboard Edge Function.
-- Keeps public clients off the aggregate views while preserving rank/position
-- reads through an authenticated function boundary.

create or replace view public.leaderboard
as
select
  p.user_id,
  p.display_name,
  p.avatar_style,
  p.avatar_seed,
  coalesce(c.total_completions, 0) as total_completions,
  coalesce(c.total_completions, 0) * 10 as total_xp,
  (coalesce(c.total_completions, 0) * 10) / 500 + 1 as level,
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

drop function if exists public.get_leaderboard(text);

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
  streak_totals as (
    select
      hc.user_id,
      count(distinct hc.completed_on)::integer as streak
    from public.habit_completions hc
    where hc.completed_on >= current_date - 60
      and hc.completed_on <= current_date
      and not exists (
        select 1
        from generate_series(
          hc.completed_on + 1,
          current_date,
          interval '1 day'
        ) gs(d)
        where gs.d::date not in (
          select distinct hc2.completed_on
          from public.habit_completions hc2
          where hc2.user_id = hc.user_id
        )
      )
    group by hc.user_id
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

create or replace function public.get_leaderboard_position(
  p_user_id uuid,
  p_period text default 'all'
)
returns table (
  rank bigint,
  total_users bigint,
  total_xp bigint,
  percentile_ahead integer
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
      end as safe_period
  ),
  completion_totals as (
    select
      hc.user_id,
      count(*)::integer as total_completions
    from public.habit_completions hc
    where hc.completed_on >= (select start_date from params)
    group by hc.user_id
  ),
  leaderboard_rows as (
    select
      p.user_id,
      p.display_name,
      (coalesce(ct.total_completions, 0)::bigint * 10) as total_xp
    from public.profiles p
    left join completion_totals ct on ct.user_id = p.user_id
    where p.display_name is not null
      and (
        (select safe_period from params) = 'all'
        or coalesce(ct.total_completions, 0) > 0
      )
  ),
  ranked as (
    select
      row_number() over (order by lr.total_xp desc, lr.display_name asc, lr.user_id asc)::bigint as rank,
      count(*) over ()::bigint as total_users,
      lr.user_id,
      lr.total_xp
    from leaderboard_rows lr
  )
  select
    r.rank,
    r.total_users,
    r.total_xp,
    case
      when r.total_users > 1 then round(((r.total_users - r.rank)::numeric / r.total_users::numeric) * 100)::integer
      else null
    end as percentile_ahead
  from ranked r
  where r.user_id = p_user_id;
$$;

revoke execute on function public.get_leaderboard_entries(text, integer, uuid) from public;
revoke execute on function public.get_leaderboard_entries(text, integer, uuid) from anon;
revoke execute on function public.get_leaderboard_entries(text, integer, uuid) from authenticated;
grant execute on function public.get_leaderboard_entries(text, integer, uuid) to service_role;

revoke execute on function public.get_leaderboard_position(uuid, text) from public;
revoke execute on function public.get_leaderboard_position(uuid, text) from anon;
revoke execute on function public.get_leaderboard_position(uuid, text) from authenticated;
grant execute on function public.get_leaderboard_position(uuid, text) to service_role;
