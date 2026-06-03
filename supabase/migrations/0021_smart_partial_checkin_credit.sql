-- Treat habit_completions as daily progress rows for target habits.
-- A row earns completion credit only when the logged value reaches the
-- habit target; boolean/targetless habits still count when a row exists.

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
  select count(*)::int as total_completions, max(hc.completed_on) as last_completion_date
  from public.habit_completions hc
  join public.habits h on h.id = hc.habit_id
  where hc.user_id = p.user_id
    and h.user_id = hc.user_id
    and (h.target is null or h.target <= 0 or coalesce(hc.value, 1) >= h.target)
) c on true
left join lateral (
  select count(*)::int as total_habits
  from public.habits
  where user_id = p.user_id and archived_at is null
) h on true
where p.display_name is not null;

grant select on public.leaderboard to authenticated;

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
  if v_user_id is null then
    raise exception 'authenticated user required';
  end if;

  v_start_date := case
    when period = 'week' then current_date - interval '7 days'
    when period = 'month' then current_date - interval '30 days'
    else '1970-01-01'::date
  end;

  return query
  with completed_credit as (
    select
      hc.user_id,
      hc.completed_on
    from public.habit_completions hc
    join public.habits h on h.id = hc.habit_id
    where h.user_id = hc.user_id
      and (h.target is null or h.target <= 0 or coalesce(hc.value, 1) >= h.target)
  ),
  user_xp as (
    select
      cc.user_id,
      count(*)::bigint * 10 as xp
    from completed_credit cc
    where cc.completed_on >= v_start_date
    group by cc.user_id
  ),
  user_streak as (
    select
      cc.user_id,
      count(distinct cc.completed_on)::int as streak
    from completed_credit cc
    where cc.completed_on >= current_date - interval '60 days'
      and cc.completed_on <= current_date
      and not exists (
        select 1
        from generate_series(
          cc.completed_on + 1,
          current_date,
          interval '1 day'
        ) gs(d)
        where gs.d::date not in (
          select distinct cc2.completed_on
          from completed_credit cc2
          where cc2.user_id = cc.user_id
        )
      )
    group by cc.user_id
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

revoke execute on function public.get_leaderboard(text) from public;
revoke execute on function public.get_leaderboard(text) from anon;
grant execute on function public.get_leaderboard(text) to authenticated;
