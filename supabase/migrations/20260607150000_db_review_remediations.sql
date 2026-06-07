-- DB review remediations (see plan: database review + targeted fixes).
-- Both statements are idempotent so re-running via `supabase db push` is a no-op.

-- 1. Covering index for the composite owner FK
--    `habit_completions_habit_owner_fk (habit_id, user_id)` was unindexed
--    (flagged by `supabase db advisors`), slowing joins to habits and the
--    cascade when a habit is deleted. This index is not redundant with the
--    existing `(user_id, completed_on)` index.
create index if not exists habit_completions_habit_owner_idx
  on public.habit_completions (habit_id, user_id);

-- 2. Clean dead fields on boolean habits.
--    Boolean habits ignore unit/target everywhere (isQuantityHabit() excludes
--    them), but some legacy rows carry a leftover unit/target. Normalize them to
--    the catalog convention (unit '', no target) so they read cleanly.
update public.habits
set unit = '', target = null
where metric_type = 'boolean'
  and (coalesce(unit, '') <> '' or target is not null);
