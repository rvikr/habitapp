-- Exactly-once quantity logging for first-use activation. A transport failure
-- can happen after Postgres commits, so replaying a bare increment is unsafe.
-- The receipt and completion update below commit atomically under one
-- user-scoped operation UUID.

create table app_private.completion_increment_receipts (
  user_id uuid not null,
  operation_id uuid not null,
  habit_id uuid not null,
  completed_on date not null,
  increment numeric not null,
  note text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint completion_increment_receipts_pkey
    primary key (user_id, operation_id),
  constraint completion_increment_receipts_habit_owner_fk
    foreign key (habit_id, user_id)
    references public.habits(id, user_id)
    on delete cascade,
  constraint completion_increment_receipts_increment_positive_finite
    check (
      increment > 0
      and increment::text not in ('NaN', 'Infinity', '-Infinity')
    )
);

alter table app_private.completion_increment_receipts enable row level security;
revoke all on table app_private.completion_increment_receipts
  from public, anon, authenticated, service_role;

create function app_private.log_habit_completion_once(
  p_operation_id uuid,
  p_habit_id uuid,
  p_completed_on date,
  p_increment numeric,
  p_note text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_inserted boolean := false;
  v_existing app_private.completion_increment_receipts%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'completion operation id is required' using errcode = '22023';
  end if;
  if p_completed_on is null then
    raise exception 'completion date is required' using errcode = '22023';
  end if;
  if p_increment is null
     or p_increment <= 0
     or p_increment::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'completion increment must be positive and finite' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.habits as h
     where h.id = p_habit_id
       and h.user_id = v_user_id
  ) then
    raise exception 'habit does not belong to authenticated user' using errcode = '42501';
  end if;

  insert into app_private.completion_increment_receipts (
    user_id,
    operation_id,
    habit_id,
    completed_on,
    increment,
    note
  ) values (
    v_user_id,
    p_operation_id,
    p_habit_id,
    p_completed_on,
    p_increment,
    p_note
  )
  on conflict (user_id, operation_id) do nothing
  returning true into v_inserted;

  if v_inserted then
    insert into public.habit_completions (
      habit_id,
      user_id,
      completed_on,
      value,
      note
    ) values (
      p_habit_id,
      v_user_id,
      p_completed_on,
      p_increment,
      p_note
    )
    on conflict (habit_id, completed_on) do update
      set value = coalesce(public.habit_completions.value, 0) + excluded.value,
          note = excluded.note;
    return true;
  end if;

  select r.*
    into strict v_existing
    from app_private.completion_increment_receipts as r
   where r.user_id = v_user_id
     and r.operation_id = p_operation_id;

  if v_existing.habit_id is distinct from p_habit_id
     or v_existing.completed_on is distinct from p_completed_on
     or v_existing.increment is distinct from p_increment
     or v_existing.note is distinct from p_note then
    raise exception 'idempotency key reused with different payload' using errcode = '22023';
  end if;

  return false;
end;
$$;

revoke all on function app_private.log_habit_completion_once(uuid, uuid, date, numeric, text)
  from public, anon, authenticated, service_role;

create function public.log_habit_completion_once(
  p_operation_id uuid,
  p_habit_id uuid,
  p_completed_on date,
  p_increment numeric,
  p_note text
) returns boolean
language sql
security definer
set search_path = ''
as $$
  select app_private.log_habit_completion_once(
    p_operation_id,
    p_habit_id,
    p_completed_on,
    p_increment,
    p_note
  );
$$;

revoke all on function public.log_habit_completion_once(uuid, uuid, date, numeric, text)
  from public, anon, service_role;
revoke all on function public.log_habit_completion_once(uuid, uuid, date, numeric, text)
  from authenticated;
grant execute on function public.log_habit_completion_once(uuid, uuid, date, numeric, text)
  to authenticated;
