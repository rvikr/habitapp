-- Production AI release gates, privacy-safe telemetry, and user eligibility.

alter table public.profiles
  add column if not exists ai_adult_attested_at timestamptz,
  add column if not exists ai_disclosure_version text,
  add column if not exists time_zone text not null default 'UTC';

alter table public.profiles
  drop constraint if exists profiles_ai_disclosure_version_length;
alter table public.profiles
  add constraint profiles_ai_disclosure_version_length
  check (ai_disclosure_version is null or char_length(ai_disclosure_version) between 1 and 64);

alter table public.profiles
  drop constraint if exists profiles_time_zone_length;
alter table public.profiles
  add constraint profiles_time_zone_length
  check (char_length(time_zone) between 1 and 64);

alter table public.ai_usage_events
  add column if not exists request_id uuid,
  add column if not exists prompt_version text,
  add column if not exists model text,
  add column if not exists latency_ms integer,
  add column if not exists provider_status integer,
  add column if not exists finish_reason text,
  add column if not exists safety_category text,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer;

update public.ai_usage_events
set request_id = gen_random_uuid()
where request_id is null;

alter table public.ai_usage_events
  alter column request_id set default gen_random_uuid(),
  alter column request_id set not null;

create index if not exists ai_usage_events_request_id_idx
  on public.ai_usage_events(request_id, created_at);

alter table public.weekly_progress_reports
  add column if not exists insight_text text,
  add column if not exists prompt_version text;

update public.feature_flags
set name = 'All Gemini Features',
    description = 'Emergency kill switch for every Gemini-backed feature',
    updated_at = now()
where key = 'ai_suggestions';

create or replace function public.set_ai_access_attestation(
  p_confirmed boolean,
  p_disclosure_version text
)
returns table (
  ai_adult_attested_at timestamptz,
  ai_disclosure_version text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_version text := nullif(btrim(p_disclosure_version), '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_confirmed and (v_version is null or char_length(v_version) > 64) then
    raise exception 'valid disclosure version required' using errcode = '22023';
  end if;

  update public.profiles
  set ai_adult_attested_at = case when p_confirmed then now() else null end,
      ai_disclosure_version = case when p_confirmed then v_version else null end,
      updated_at = now()
  where user_id = v_user_id;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  return query
    select p.ai_adult_attested_at, p.ai_disclosure_version
    from public.profiles p
    where p.user_id = v_user_id;
end;
$$;

revoke execute on function public.set_ai_access_attestation(boolean, text) from public;
revoke execute on function public.set_ai_access_attestation(boolean, text) from anon;
grant execute on function public.set_ai_access_attestation(boolean, text) to authenticated;

create or replace function public.set_profile_time_zone(p_time_zone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_time_zone text := btrim(p_time_zone);
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if char_length(v_time_zone) not between 1 and 64
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_time_zone) then
    raise exception 'invalid IANA time zone' using errcode = '22023';
  end if;

  update public.profiles
  set time_zone = v_time_zone,
      updated_at = now()
  where user_id = v_user_id;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  return v_time_zone;
end;
$$;

revoke execute on function public.set_profile_time_zone(text) from public;
revoke execute on function public.set_profile_time_zone(text) from anon;
grant execute on function public.set_profile_time_zone(text) to authenticated;

drop function if exists public.consume_ai_quota(uuid, text, integer, integer);

create function public.consume_ai_quota(
  p_user_id uuid,
  p_feature text,
  p_hourly_limit integer,
  p_daily_limit integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
  );
  v_now timestamptz := now();
  v_hour_start timestamptz := date_trunc('hour', v_now);
  v_day_start timestamptz := date_trunc('day', v_now);
  v_hour_count integer;
  v_day_count integer;
  v_feature_enabled boolean;
  v_attested_at timestamptz;
  v_disclosure_version text;
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
begin
  if v_role is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '28000';
  end if;
  if p_feature not in ('coach-message', 'habit-routine', 'smart-reminders', 'progress-report', 'validate-habit') then
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
    insert into public.ai_usage_events (request_id, user_id, feature, status, reason)
    values (v_request_id, p_user_id, p_feature, 'blocked', 'feature_disabled');
    return jsonb_build_object('allowed', false, 'reason', 'feature_disabled', 'requestId', v_request_id);
  end if;

  select ai_adult_attested_at, ai_disclosure_version
    into v_attested_at, v_disclosure_version
    from public.profiles
   where user_id = p_user_id;
  if v_attested_at is null or v_disclosure_version is distinct from '2026-07-12' then
    insert into public.ai_usage_events (request_id, user_id, feature, status, reason)
    values (v_request_id, p_user_id, p_feature, 'blocked', 'ai_attestation_required');
    return jsonb_build_object('allowed', false, 'reason', 'ai_attestation_required', 'requestId', v_request_id);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_feature, 0));
  select coalesce(count, 0) into v_hour_count
    from public.ai_usage_counters
   where user_id = p_user_id and feature = p_feature
     and bucket_kind = 'hour' and bucket_start = v_hour_start
   for update;
  select coalesce(count, 0) into v_day_count
    from public.ai_usage_counters
   where user_id = p_user_id and feature = p_feature
     and bucket_kind = 'day' and bucket_start = v_day_start
   for update;

  if coalesce(v_hour_count, 0) >= p_hourly_limit then
    insert into public.ai_usage_events (request_id, user_id, feature, status, reason, metadata)
    values (v_request_id, p_user_id, p_feature, 'blocked', 'hourly_quota_exceeded', jsonb_build_object('limit', p_hourly_limit));
    return jsonb_build_object(
      'allowed', false, 'reason', 'quota_exceeded', 'bucket', 'hour', 'requestId', v_request_id,
      'retryAfterSeconds', greatest(1, extract(epoch from (v_hour_start + interval '1 hour' - v_now))::int)
    );
  end if;
  if coalesce(v_day_count, 0) >= p_daily_limit then
    insert into public.ai_usage_events (request_id, user_id, feature, status, reason, metadata)
    values (v_request_id, p_user_id, p_feature, 'blocked', 'daily_quota_exceeded', jsonb_build_object('limit', p_daily_limit));
    return jsonb_build_object(
      'allowed', false, 'reason', 'quota_exceeded', 'bucket', 'day', 'requestId', v_request_id,
      'retryAfterSeconds', greatest(1, extract(epoch from (v_day_start + interval '1 day' - v_now))::int)
    );
  end if;

  insert into public.ai_usage_counters (user_id, feature, bucket_kind, bucket_start, count)
  values
    (p_user_id, p_feature, 'hour', v_hour_start, 1),
    (p_user_id, p_feature, 'day', v_day_start, 1)
  on conflict (user_id, feature, bucket_kind, bucket_start)
  do update set count = public.ai_usage_counters.count + 1, updated_at = now();

  insert into public.ai_usage_events (request_id, user_id, feature, status)
  values (v_request_id, p_user_id, p_feature, 'allowed');
  return jsonb_build_object('allowed', true, 'requestId', v_request_id);
end;
$$;

revoke execute on function public.consume_ai_quota(uuid, text, integer, integer, uuid) from public;
revoke execute on function public.consume_ai_quota(uuid, text, integer, integer, uuid) from anon;
revoke execute on function public.consume_ai_quota(uuid, text, integer, integer, uuid) from authenticated;
grant execute on function public.consume_ai_quota(uuid, text, integer, integer, uuid) to service_role;

create or replace function public.list_due_progress_report_candidates(p_limit integer)
returns table (
  user_id uuid,
  week_start date,
  time_zone text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
  );
begin
  if v_role is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '28000';
  end if;
  if p_limit < 1 then
    raise exception 'positive candidate limit required' using errcode = '22023';
  end if;

  return query
  select
    p.user_id,
    (date_trunc('week', timezone(p.time_zone, now()))::date - 7) as week_start,
    p.time_zone
  from public.profiles p
  where (
      p.is_pro = true
      or p.pro_trial_ends_at > now()
      or (
        p.revenuecat_entitlement_active = true
        and (p.pro_expires_at is null or p.pro_expires_at > now())
      )
    )
    and not exists (
      select 1
      from public.weekly_progress_reports r
      where r.user_id = p.user_id
        and r.week_start = (date_trunc('week', timezone(p.time_zone, now()))::date - 7)
    )
  order by p.user_id
  limit least(p_limit, 1000);
end;
$$;

revoke execute on function public.list_due_progress_report_candidates(integer) from public;
revoke execute on function public.list_due_progress_report_candidates(integer) from anon;
revoke execute on function public.list_due_progress_report_candidates(integer) from authenticated;
grant execute on function public.list_due_progress_report_candidates(integer) to service_role;

-- Upgrade an existing report job or install it when the required Vault secrets
-- already exist. A warning keeps local/schema-only environments usable while
-- making a missing production prerequisite visible in migration logs.
do $$
declare
  v_job_id bigint;
  v_secret_count integer := 0;
  v_command text := $command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'progress_report_url'),
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'progress_report_cron_secret')
      ),
      body := jsonb_build_object('mode', 'cron-batch')
    );
  $command$;
begin
  if to_regclass('cron.job') is null then
    raise warning 'weekly-progress-reports not installed: pg_cron is unavailable';
    return;
  end if;
  execute 'select jobid from cron.job where jobname = $1'
    into v_job_id
    using 'weekly-progress-reports';
  if v_job_id is not null then
    execute format(
      'select cron.alter_job(%s, schedule := %L)',
      v_job_id,
      '0 * * * *'
    );
    return;
  end if;

  if to_regclass('vault.decrypted_secrets') is not null then
    execute $sql$
      select count(distinct name)
      from vault.decrypted_secrets
      where name in ('progress_report_url', 'progress_report_cron_secret')
    $sql$ into v_secret_count;
  end if;

  if v_secret_count = 2 then
    execute 'select cron.schedule($1, $2, $3)'
      using 'weekly-progress-reports', '0 * * * *', v_command;
  else
    raise warning 'weekly-progress-reports not installed: configure progress_report_url and progress_report_cron_secret Vault secrets, then apply the README schedule';
  end if;
end;
$$;

create or replace view public.ai_health_summary
with (security_invoker = true)
as
select
  date_trunc('day', created_at) as day,
  feature,
  status,
  coalesce(reason, 'none') as reason,
  count(*)::bigint as event_count,
  percentile_cont(0.95) within group (order by latency_ms)
    filter (where latency_ms is not null) as p95_latency_ms,
  coalesce(sum(input_tokens), 0)::bigint as input_tokens,
  coalesce(sum(output_tokens), 0)::bigint as output_tokens
from public.ai_usage_events
group by 1, 2, 3, 4;

revoke all on public.ai_health_summary from public, anon, authenticated;
grant select on public.ai_health_summary to service_role;
