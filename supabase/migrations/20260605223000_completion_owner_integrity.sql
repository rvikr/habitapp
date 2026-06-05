-- Enforce that every completion belongs to the same user as its habit.
-- RLS limits visible rows, but the foreign key is the database boundary that
-- prevents cross-owner habit_id/user_id pairs if a habit UUID is ever exposed.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'habits_id_user_id_unique'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits
      add constraint habits_id_user_id_unique unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'habit_completions_habit_owner_fk'
      and conrelid = 'public.habit_completions'::regclass
  ) then
    alter table public.habit_completions
      add constraint habit_completions_habit_owner_fk
      foreign key (habit_id, user_id)
      references public.habits(id, user_id)
      on delete cascade
      not valid;
  end if;
end $$;

alter table public.habit_completions
  validate constraint habit_completions_habit_owner_fk;
