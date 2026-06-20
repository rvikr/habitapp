-- Bound reminder arrays at the database boundary so user-owned rows cannot
-- amplify scheduled reminder work with duplicate or oversized arrays.

create or replace function public.valid_reminder_times(times text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select times is null or (
    cardinality(times) <= 8
    and not exists (
      select 1
      from unnest(times) as t(value)
      where value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    )
    and (
      select count(*)
      from unnest(times) as t(value)
    ) = (
      select count(distinct value)
      from unnest(times) as t(value)
    )
  )
$$;

create or replace function public.valid_reminder_days(days int[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select days is null or (
    cardinality(days) <= 7
    and not exists (
      select 1
      from unnest(days) as d(value)
      where value < 0 or value > 6
    )
    and (
      select count(*)
      from unnest(days) as d(value)
    ) = (
      select count(distinct value)
      from unnest(days) as d(value)
    )
  )
$$;

alter table public.habits
  drop constraint if exists habits_reminder_times_valid,
  add constraint habits_reminder_times_valid
  check (public.valid_reminder_times(reminder_times)) not valid;

alter table public.habits
  drop constraint if exists habits_reminder_days_valid,
  add constraint habits_reminder_days_valid
  check (public.valid_reminder_days(reminder_days)) not valid;
