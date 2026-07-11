-- Activation V2 rollout configuration and server-owned activation milestones.

alter table public.feature_flags
  add column if not exists rollout_percentage integer not null default 100;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'feature_flags_rollout_percentage_check'
      and conrelid = 'public.feature_flags'::regclass
  ) then
    alter table public.feature_flags
      add constraint feature_flags_rollout_percentage_check
      check (rollout_percentage between 0 and 100);
  end if;
end $$;

insert into public.feature_flags (
  key,
  name,
  description,
  enabled,
  rollout_percentage
) values (
  'activation_v2',
  'Activation V2',
  'Use the guided activation experience for a deterministic percentage of signed-in users',
  false,
  0
)
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    enabled = false,
    rollout_percentage = 0,
    updated_at = now();

alter table public.profiles
  add column if not exists first_habit_logged_at timestamptz,
  add column if not exists activation_engaged_at timestamptz;

-- Reassert the existing column-level write boundary. Activation milestones are
-- intentionally omitted: only the private trigger may write them.
revoke insert, update on table public.profiles from anon, authenticated;

grant insert (user_id, display_name, avatar_style, avatar_seed, coach_tone, platform, updated_at)
  on table public.profiles to authenticated;

grant update (display_name, avatar_style, avatar_seed, coach_tone, platform, updated_at)
  on table public.profiles to authenticated;

with ranked_completions as (
  select
    user_id,
    created_at,
    row_number() over (partition by user_id order by created_at, id) as completion_rank
  from public.habit_completions
  where value > 0
),
backfill as (
  select
    user_id,
    max(created_at) filter (where completion_rank = 1) as first_habit_logged_at,
    max(created_at) filter (where completion_rank = 3) as activation_engaged_at
  from ranked_completions
  where completion_rank <= 3
  group by user_id
)
update public.profiles as p
set first_habit_logged_at = coalesce(p.first_habit_logged_at, b.first_habit_logged_at),
    activation_engaged_at = coalesce(p.activation_engaged_at, b.activation_engaged_at)
from backfill as b
where p.user_id = b.user_id
  and (
    (p.first_habit_logged_at is null and b.first_habit_logged_at is not null)
    or (p.activation_engaged_at is null and b.activation_engaged_at is not null)
  );

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated, service_role;

create or replace function app_private.update_activation_milestones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
  );
  v_first_habit_logged_at timestamptz;
  v_positive_completion_count integer;
begin
  if v_caller_id is not null then
    if v_caller_id <> new.user_id then
      raise exception 'activation milestone owner mismatch' using errcode = '42501';
    end if;
  elsif v_request_role is distinct from 'service_role' then
    raise exception 'activation milestone caller is not authorized' using errcode = '42501';
  end if;

  -- Lock only users who have not engaged. Missing profiles and already-engaged
  -- users both return without affecting the completion write.
  select p.first_habit_logged_at
    into v_first_habit_logged_at
    from public.profiles as p
   where p.user_id = new.user_id
     and p.activation_engaged_at is null
   for update;

  if not found then
    return new;
  end if;

  if v_first_habit_logged_at is null then
    update public.profiles
       set first_habit_logged_at = coalesce(first_habit_logged_at, pg_catalog.now())
     where user_id = new.user_id;
  end if;

  select count(*)::integer
    into v_positive_completion_count
    from (
      select hc.id
      from public.habit_completions as hc
      where hc.user_id = new.user_id
        and hc.value > 0
      limit 3
    ) as first_three_positive_completions;

  if v_positive_completion_count >= 3 then
    update public.profiles
       set activation_engaged_at = coalesce(activation_engaged_at, pg_catalog.now())
     where user_id = new.user_id;
  end if;

  return new;
end;
$$;

revoke all on function app_private.update_activation_milestones()
  from public, anon, authenticated, service_role;

drop trigger if exists on_habit_completion_update_activation on public.habit_completions;
create trigger on_habit_completion_update_activation
  after insert or update of value on public.habit_completions
  for each row
  when (new.value > 0)
  execute function app_private.update_activation_milestones();
