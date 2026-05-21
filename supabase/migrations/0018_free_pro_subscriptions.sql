-- Free/Pro subscriptions: automatic signup trials plus RevenueCat-backed Pro access.

alter table public.profiles
  add column if not exists pro_trial_started_at timestamptz,
  add column if not exists pro_trial_ends_at timestamptz,
  add column if not exists revenuecat_app_user_id text,
  add column if not exists revenuecat_entitlement_id text,
  add column if not exists revenuecat_product_id text,
  add column if not exists revenuecat_store text,
  add column if not exists revenuecat_period_type text,
  add column if not exists revenuecat_latest_event_id text,
  add column if not exists revenuecat_entitlement_active boolean not null default false,
  add column if not exists revenuecat_status text not null default 'free',
  add column if not exists pro_expires_at timestamptz,
  add column if not exists subscription_synced_at timestamptz;

create index if not exists profiles_revenuecat_app_user_id_idx
  on public.profiles(revenuecat_app_user_id);

create index if not exists profiles_pro_access_idx
  on public.profiles(user_id, is_pro, pro_trial_ends_at, revenuecat_entitlement_active, pro_expires_at);

alter table public.profiles
  drop constraint if exists profiles_revenuecat_status_check,
  add constraint profiles_revenuecat_status_check
  check (revenuecat_status in ('free', 'trial', 'active', 'grace_period', 'billing_issue', 'expired', 'cancelled'));

create or replace function public.has_pro_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select
      p.is_pro
      or (p.pro_trial_ends_at is not null and p.pro_trial_ends_at > now())
      or (
        p.revenuecat_entitlement_active
        and (p.pro_expires_at is null or p.pro_expires_at > now())
      )
    from public.profiles p
    where p.user_id = p_user_id
  ), false)
$$;

revoke execute on function public.has_pro_access(uuid) from public;
revoke execute on function public.has_pro_access(uuid) from anon;
revoke execute on function public.has_pro_access(uuid) from authenticated;
grant execute on function public.has_pro_access(uuid) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id, pro_trial_started_at, pro_trial_ends_at)
  values (new.id, now(), now() + interval '7 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
