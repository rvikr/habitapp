-- Monotonic completion writes for auto-tracked habits. The step sync used an
-- absolute upsert that overwrote whatever value the row held, silently
-- clobbering manual logs made through log_habit_completion. This function only
-- ever RAISES today's value: lower or equal writes are no-ops, and an existing
-- note (e.g. from a manual log) is preserved over the sync note.

create or replace function public.raise_habit_completion_value(
  p_habit_id     uuid,
  p_completed_on date,
  p_value        numeric,
  p_note         text default null
) returns void
language sql
security invoker
as $$
  insert into public.habit_completions (habit_id, user_id, completed_on, value, note)
  values (p_habit_id, auth.uid(), p_completed_on, p_value, p_note)
  on conflict (habit_id, completed_on) do update
    set value = excluded.value,
        note  = coalesce(public.habit_completions.note, excluded.note)
    where coalesce(public.habit_completions.value, 0) < excluded.value;
$$;

revoke all     on function public.raise_habit_completion_value(uuid, date, numeric, text) from public;
grant  execute on function public.raise_habit_completion_value(uuid, date, numeric, text) to authenticated;
