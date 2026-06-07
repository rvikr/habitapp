-- Re-canonicalize habits.unit so it always matches metric_type.
--
-- Legacy rows (and data created before unit canonicalization, or migrated by the
-- name-based inference in 0009) could drift so that a habit's `unit` disagreed
-- with its `metric_type` — e.g. a `steps` habit stored with unit `km`, which the
-- weekly report then rendered as the bogus "143 km". New writes are already
-- canonicalized by canonicalUnit() in lib/coach/habit-intelligence.ts (applied in
-- createHabit / updateHabitFull); this backfills existing rows to the same rule.
--
-- Scope: only the six quantity metric types. Boolean habits are intentionally
-- left untouched — their unit is ignored everywhere (isQuantityHabit() excludes
-- boolean), so it carries no display risk. Rows with a null metric_type are
-- legacy and handled by the app's runtime fallbacks. `target` is not changed:
-- the correct numeric target can't be inferred from a wrong unit alone.
--
-- Idempotent: the WHERE clause skips rows already in canonical form, so re-running
-- (e.g. via `supabase db push`) is a no-op.

update public.habits
set unit = case metric_type
    when 'volume_ml'   then 'ml'
    when 'steps'       then 'steps'
    when 'hours'       then 'hr'
    when 'pages'       then 'pages'
    when 'minutes'     then 'min'
    when 'distance_km' then 'km'
  end
where metric_type in ('volume_ml', 'steps', 'hours', 'pages', 'minutes', 'distance_km')
  and unit is distinct from (case metric_type
    when 'volume_ml'   then 'ml'
    when 'steps'       then 'steps'
    when 'hours'       then 'hr'
    when 'pages'       then 'pages'
    when 'minutes'     then 'min'
    when 'distance_km' then 'km'
  end);
