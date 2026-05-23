-- Weekly AI-generated progress reports for Pro members.
-- Stores one row per (user, ISO-week-start) populated by the progress-report edge function.

create table if not exists public.weekly_progress_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  week_start      date not null,
  summary_text    text not null,
  stats_snapshot  jsonb not null default '{}'::jsonb,
  model           text,
  generated_at    timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists weekly_progress_reports_user_week_idx
  on public.weekly_progress_reports(user_id, week_start desc);

alter table public.weekly_progress_reports enable row level security;

revoke all on table public.weekly_progress_reports from anon, authenticated, public;
grant select on table public.weekly_progress_reports to authenticated;

drop policy if exists "users read own weekly_progress_reports"
  on public.weekly_progress_reports;
create policy "users read own weekly_progress_reports"
  on public.weekly_progress_reports for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Extend the shared AI quota feature whitelist with the new report feature.

alter table public.ai_usage_counters
  drop constraint if exists ai_usage_counters_feature_check;

alter table public.ai_usage_counters
  add constraint ai_usage_counters_feature_check
  check (feature in ('coach-message', 'habit-routine', 'smart-reminders', 'progress-report'));

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_feature_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_feature_check
  check (feature in ('coach-message', 'habit-routine', 'smart-reminders', 'progress-report'));

create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_feature text,
  p_hourly_limit integer,
  p_daily_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims',    true), '')::jsonb)->>'role'
  );
  v_now timestamptz := now();
  v_hour_start timestamptz := date_trunc('hour', v_now);
  v_day_start timestamptz := date_trunc('day', v_now);
  v_hour_count integer;
  v_day_count integer;
  v_feature_enabled boolean;
begin
  if v_role is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '28000';
  end if;

  if p_feature not in ('coach-message', 'habit-routine', 'smart-reminders', 'progress-report') then
    raise exception 'invalid AI feature' using errcode = '22023';
  end if;

  if p_hourly_limit < 1 or p_daily_limit < 1 then
    raise exception 'AI quota limits must be positive' using errcode = '22023';
  end if;

  select coalesce(enabled, false)
    into v_feature_enabled
    from public.feature_flags
   where key = 'ai_suggestions';

  if not coalesce(v_feature_enabled, false) then
    insert into public.ai_usage_events (user_id, feature, status, reason)
    values (p_user_id, p_feature, 'blocked', 'feature_disabled');
    return jsonb_build_object('allowed', false, 'reason', 'feature_disabled');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_feature, 0));

  select coalesce(count, 0)
    into v_hour_count
    from public.ai_usage_counters
   where user_id = p_user_id
     and feature = p_feature
     and bucket_kind = 'hour'
     and bucket_start = v_hour_start
   for update;

  select coalesce(count, 0)
    into v_day_count
    from public.ai_usage_counters
   where user_id = p_user_id
     and feature = p_feature
     and bucket_kind = 'day'
     and bucket_start = v_day_start
   for update;

  if coalesce(v_hour_count, 0) >= p_hourly_limit then
    insert into public.ai_usage_events (user_id, feature, status, reason, metadata)
    values (
      p_user_id,
      p_feature,
      'blocked',
      'hourly_quota_exceeded',
      jsonb_build_object('limit', p_hourly_limit)
    );
    return jsonb_build_object(
      'allowed', false,
      'reason', 'quota_exceeded',
      'bucket', 'hour',
      'retryAfterSeconds', greatest(1, extract(epoch from (v_hour_start + interval '1 hour' - v_now))::int)
    );
  end if;

  if coalesce(v_day_count, 0) >= p_daily_limit then
    insert into public.ai_usage_events (user_id, feature, status, reason, metadata)
    values (
      p_user_id,
      p_feature,
      'blocked',
      'daily_quota_exceeded',
      jsonb_build_object('limit', p_daily_limit)
    );
    return jsonb_build_object(
      'allowed', false,
      'reason', 'quota_exceeded',
      'bucket', 'day',
      'retryAfterSeconds', greatest(1, extract(epoch from (v_day_start + interval '1 day' - v_now))::int)
    );
  end if;

  insert into public.ai_usage_counters (user_id, feature, bucket_kind, bucket_start, count)
  values
    (p_user_id, p_feature, 'hour', v_hour_start, 1),
    (p_user_id, p_feature, 'day', v_day_start, 1)
  on conflict (user_id, feature, bucket_kind, bucket_start)
  do update set count = public.ai_usage_counters.count + 1,
                updated_at = now();

  insert into public.ai_usage_events (user_id, feature, status)
  values (p_user_id, p_feature, 'allowed');

  return jsonb_build_object('allowed', true);
end;
$$;

revoke execute on function public.consume_ai_quota(uuid, text, integer, integer) from public;
revoke execute on function public.consume_ai_quota(uuid, text, integer, integer) from anon;
revoke execute on function public.consume_ai_quota(uuid, text, integer, integer) from authenticated;
grant execute on function public.consume_ai_quota(uuid, text, integer, integer) to service_role;

-- Weekly cron schedule (Mondays 09:00 UTC) — requires pg_cron + pg_net extensions
-- and two Vault secrets: 'progress_report_url' and 'progress_report_cron_secret'.
-- The edge function authenticates cron callers by comparing X-Cron-Secret to the env
-- var PROGRESS_REPORT_CRON_SECRET. Run once per environment, e.g.:
--
--   select vault.create_secret('https://<project-ref>.functions.supabase.co/progress-report',
--                              'progress_report_url');
--   select vault.create_secret('<random-shared-secret>', 'progress_report_cron_secret');
--
-- Then enable the cron:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   select cron.schedule(
--     'weekly-progress-reports',
--     '0 9 * * 1',
--     $cron$
--       select net.http_post(
--         url     := (select decrypted_secret from vault.decrypted_secrets where name = 'progress_report_url'),
--         headers := jsonb_build_object(
--                      'content-type', 'application/json',
--                      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'progress_report_cron_secret')
--                    ),
--         body    := jsonb_build_object('mode', 'cron-batch')
--       );
--     $cron$
--   );
