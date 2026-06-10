-- Bound habit text fields. The client caps name/description/unit input, but
-- nothing stopped a direct API call from storing arbitrarily long text, which
-- breaks habit cards, notification bodies, and inflates AI prompt tokens.
-- Server limits are intentionally looser than the client caps (80/500/16).

-- Clamp any existing oversized rows before adding the constraints.
update public.habits set name = left(name, 120) where char_length(name) > 120;
update public.habits set description = left(description, 1000)
  where description is not null and char_length(description) > 1000;
update public.habits set unit = left(unit, 32)
  where unit is not null and char_length(unit) > 32;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'habits_name_length'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits add constraint habits_name_length
      check (char_length(name) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'habits_description_length'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits add constraint habits_description_length
      check (description is null or char_length(description) <= 1000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'habits_unit_length'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits add constraint habits_unit_length
      check (unit is null or char_length(unit) <= 32);
  end if;
end $$;
