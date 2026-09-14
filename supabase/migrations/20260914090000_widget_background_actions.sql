-- Additive infrastructure for native home-screen widget actions. No existing
-- table, policy, trigger, or RPC signature is changed by this migration.

create table if not exists public.widget_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  platform text not null check (platform in ('ios', 'android')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint widget_devices_device_id_length check (char_length(device_id) between 16 and 128),
  constraint widget_devices_user_device_unique unique (user_id, device_id, platform)
);

create index if not exists widget_devices_active_token_idx
  on public.widget_devices (token_hash, expires_at)
  where revoked_at is null;

alter table public.widget_devices enable row level security;
revoke all on table public.widget_devices from public, anon, authenticated;

create table if not exists app_private.widget_action_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  habit_id uuid not null,
  completed_on date not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  foreign key (habit_id, user_id) references public.habits(id, user_id) on delete cascade
);

alter table app_private.widget_action_receipts enable row level security;
revoke all on table app_private.widget_action_receipts
  from public, anon, authenticated, service_role;

create or replace function public.widget_log_habit_completion_once(
  p_user_id uuid,
  p_operation_id uuid,
  p_habit_id uuid,
  p_completed_on date
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_habit public.habits%rowtype;
  v_current numeric := 0;
  v_target numeric;
  v_increment numeric;
  v_response jsonb;
  v_inserted boolean := false;
  v_receipt_habit_id uuid;
  v_receipt_date date;
begin
  if p_user_id is null or p_operation_id is null or p_habit_id is null or p_completed_on is null then
    raise exception 'missing widget action input' using errcode = '22023';
  end if;

  select h.* into v_habit
    from public.habits h
   where h.id = p_habit_id
     and h.user_id = p_user_id
     and h.archived_at is null
   for update;
  if not found then
    raise exception 'habit unavailable' using errcode = 'P0002';
  end if;

  insert into app_private.widget_action_receipts
    (user_id, operation_id, habit_id, completed_on)
  values (p_user_id, p_operation_id, p_habit_id, p_completed_on)
  on conflict (user_id, operation_id) do nothing
  returning true into v_inserted;

  if not v_inserted then
    select response, habit_id, completed_on
      into v_response, v_receipt_habit_id, v_receipt_date
      from app_private.widget_action_receipts
     where user_id = p_user_id and operation_id = p_operation_id;
    if v_receipt_habit_id is distinct from p_habit_id
       or v_receipt_date is distinct from p_completed_on then
      raise exception 'idempotency key reused with different payload' using errcode = '22023';
    end if;
    if v_response is null then
      raise exception 'widget action is still processing' using errcode = '40001';
    end if;
    return v_response;
  end if;

  select coalesce(hc.value, 0) into v_current
    from public.habit_completions hc
   where hc.habit_id = p_habit_id and hc.completed_on = p_completed_on
   for update;
  v_current := coalesce(v_current, 0);
  v_target := case when v_habit.target is not null and v_habit.target > 0 then v_habit.target else null end;

  if coalesce(v_habit.metric_type, 'boolean') = 'boolean' or v_target is null then
    if v_current >= 1 then raise exception 'habit already complete' using errcode = '23514'; end if;
    v_increment := 1;
  else
    if v_current >= v_target then raise exception 'habit already complete' using errcode = '23514'; end if;
    v_increment := least(coalesce(nullif(v_habit.default_log_value, 0), 1), v_target - v_current);
  end if;

  if v_increment <= 0 or v_increment::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'invalid widget increment' using errcode = '22023';
  end if;

  insert into public.habit_completions (habit_id, user_id, completed_on, value, note)
  values (p_habit_id, p_user_id, p_completed_on, v_increment, 'Logged from widget')
  on conflict (habit_id, completed_on) do update
    set value = coalesce(public.habit_completions.value, 0) + excluded.value,
        note = excluded.note;

  v_current := v_current + v_increment;
  v_response := jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'habitId', p_habit_id,
    'habitName', v_habit.name,
    'increment', v_increment,
    'unit', coalesce(v_habit.unit, ''),
    'currentValue', v_current,
    'target', v_target,
    'completed', case when v_target is null then v_current >= 1 else v_current >= v_target end
  );

  update app_private.widget_action_receipts
     set response = v_response
   where user_id = p_user_id and operation_id = p_operation_id;
  return v_response;
end;
$$;

revoke all on function public.widget_log_habit_completion_once(uuid, uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.widget_log_habit_completion_once(uuid, uuid, uuid, date)
  to service_role;

create or replace function public.widget_sync_daily_steps(
  p_user_id uuid,
  p_completed_on date,
  p_steps integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_habit public.habits%rowtype;
  v_value numeric;
begin
  if p_steps < 0 or p_steps > 1000000 then
    raise exception 'invalid daily step total' using errcode = '22023';
  end if;

  select h.* into v_habit
    from public.habits h
   where h.user_id = p_user_id
     and h.archived_at is null
     and h.metric_type = 'steps'
   order by h.created_at
   limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'steps', p_steps, 'habitUpdated', false);
  end if;

  insert into public.habit_completions (habit_id, user_id, completed_on, value, note)
  values (v_habit.id, p_user_id, p_completed_on, p_steps, 'Synced from widget')
  on conflict (habit_id, completed_on) do update
    set value = greatest(coalesce(public.habit_completions.value, 0), excluded.value),
        note = case
          when excluded.value > coalesce(public.habit_completions.value, 0) then excluded.note
          else public.habit_completions.note
        end
  returning value into v_value;

  return jsonb_build_object(
    'ok', true,
    'steps', p_steps,
    'habitUpdated', true,
    'habitId', v_habit.id,
    'currentValue', v_value,
    'target', v_habit.target
  );
end;
$$;

revoke all on function public.widget_sync_daily_steps(uuid, date, integer)
  from public, anon, authenticated;
grant execute on function public.widget_sync_daily_steps(uuid, date, integer)
  to service_role;
