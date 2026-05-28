-- Atomic completion logging. Replaces a read-then-upsert pattern in
-- lib/data/actions.ts#logCompletion that lost concurrent increments
-- (two devices or rapid double-taps both reading the same value, both
-- writing v+1 instead of v+2). The function reads-and-increments in a
-- single statement using ON CONFLICT DO UPDATE.

create or replace function public.log_habit_completion(
  p_habit_id     uuid,
  p_completed_on date,
  p_increment    numeric default 1,
  p_note         text default null
) returns void
language sql
security invoker
as $$
  insert into public.habit_completions (habit_id, user_id, completed_on, value, note)
  values (p_habit_id, auth.uid(), p_completed_on, p_increment, p_note)
  on conflict (habit_id, completed_on) do update
    set value = coalesce(public.habit_completions.value, 0) + excluded.value,
        note  = excluded.note;
$$;

revoke all     on function public.log_habit_completion(uuid, date, numeric, text) from public;
grant  execute on function public.log_habit_completion(uuid, date, numeric, text) to authenticated;
