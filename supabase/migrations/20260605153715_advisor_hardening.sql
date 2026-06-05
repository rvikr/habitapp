-- Supabase advisor hardening:
-- - make auth.uid() RLS checks initplan-friendly with (select auth.uid())
-- - pin function search_path for functions flagged by the security advisor
-- - keep service-only tables private while giving RLS an explicit service_role path
-- - move pg_net's extension metadata out of public when the installed build allows it

create schema if not exists extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'pg_net'
      and extrelocatable
  ) then
    execute 'alter extension pg_net set schema extensions';
  end if;
end $$;

create or replace function public.valid_reminder_times(times text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select times is null or coalesce(bool_and(value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), true)
  from unnest(times) as t(value)
$$;

create or replace function public.log_habit_completion(
  p_habit_id     uuid,
  p_completed_on date,
  p_increment    numeric default 1,
  p_note         text default null
) returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  insert into public.habit_completions (habit_id, user_id, completed_on, value, note)
  values (p_habit_id, (select auth.uid()), p_completed_on, p_increment, p_note)
  on conflict (habit_id, completed_on) do update
    set value = coalesce(public.habit_completions.value, 0) + excluded.value,
        note  = excluded.note;
$$;

revoke all on function public.log_habit_completion(uuid, date, numeric, text) from public;
grant execute on function public.log_habit_completion(uuid, date, numeric, text) to authenticated;

revoke execute on function public.get_public_stats() from public, authenticated;
grant execute on function public.get_public_stats() to anon;

drop policy if exists "habits: owner read" on public.habits;
create policy "habits: owner read"
  on public.habits for select
  using ((select auth.uid()) = user_id);

drop policy if exists "habits: owner insert" on public.habits;
create policy "habits: owner insert"
  on public.habits for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "habits: owner update" on public.habits;
create policy "habits: owner update"
  on public.habits for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "habits: owner delete" on public.habits;
create policy "habits: owner delete"
  on public.habits for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "completions: owner read" on public.habit_completions;
create policy "completions: owner read"
  on public.habit_completions for select
  using ((select auth.uid()) = user_id);

drop policy if exists "completions: owner insert" on public.habit_completions;
create policy "completions: owner insert"
  on public.habit_completions for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "completions: owner delete" on public.habit_completions;
create policy "completions: owner delete"
  on public.habit_completions for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "completions: owner update" on public.habit_completions;
create policy "completions: owner update"
  on public.habit_completions for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "profiles: owner read self" on public.profiles;
create policy "profiles: owner read self"
  on public.profiles for select
  using ((select auth.uid()) = user_id);

drop policy if exists "profiles: owner upsert" on public.profiles;
create policy "profiles: owner upsert"
  on public.profiles for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "profiles: owner update" on public.profiles;
create policy "profiles: owner update"
  on public.profiles for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "feedback: owner insert" on public.feedback_reports;
create policy "feedback: owner insert"
  on public.feedback_reports for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "feedback: owner read" on public.feedback_reports;
create policy "feedback: owner read"
  on public.feedback_reports for select
  using ((select auth.uid()) = user_id);

drop policy if exists "deletion requests: owner insert" on public.account_deletion_requests;
create policy "deletion requests: owner insert"
  on public.account_deletion_requests for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "deletion requests: owner read" on public.account_deletion_requests;
create policy "deletion requests: owner read"
  on public.account_deletion_requests for select
  using ((select auth.uid()) = user_id);

drop policy if exists "owner_all" on public.web_push_subscriptions;
create policy "owner_all" on public.web_push_subscriptions
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

do $$
begin
  if to_regclass('public.admin_audit_log') is not null then
    execute 'drop policy if exists "service_role_all" on public.admin_audit_log';
    execute 'create policy "service_role_all" on public.admin_audit_log for all to service_role using (true) with check (true)';
  end if;

  if to_regclass('public.ai_usage_counters') is not null then
    execute 'drop policy if exists "service_role_all" on public.ai_usage_counters';
    execute 'create policy "service_role_all" on public.ai_usage_counters for all to service_role using (true) with check (true)';
  end if;

  if to_regclass('public.ai_usage_events') is not null then
    execute 'drop policy if exists "service_role_all" on public.ai_usage_events';
    execute 'create policy "service_role_all" on public.ai_usage_events for all to service_role using (true) with check (true)';
  end if;
end $$;
