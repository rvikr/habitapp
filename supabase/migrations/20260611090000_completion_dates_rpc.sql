-- getStats previously selected every habit_completions row for the caller to
-- derive streaks client-side. PostgREST caps responses at 1,000 rows, so a
-- daily user with a few habits got silently truncated history after ~7 months
-- (wrong longest streak), and every dashboard load re-downloaded an unbounded
-- payload. Streak math only needs the distinct completion dates, so return
-- exactly those, newest first, bounded to four years of daily use.

create or replace function public.get_completion_dates()
returns setof date
language sql
stable
security invoker
set search_path = public
as $$
  select distinct completed_on
  from public.habit_completions
  where user_id = (select auth.uid())
  order by completed_on desc
  limit 1461;
$$;

revoke execute on function public.get_completion_dates() from public;
revoke execute on function public.get_completion_dates() from anon;
grant execute on function public.get_completion_dates() to authenticated;
