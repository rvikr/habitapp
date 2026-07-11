-- =====================================================
-- Lagan Admin Panel — Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- =====================================================

-- Feature flags (runtime toggles without code deploys)
create table if not exists public.feature_flags (
  key         text primary key,
  name        text not null,
  description text,
  enabled     boolean not null default false,
  rollout_percentage integer not null default 100,
  updated_at  timestamptz not null default now()
);

alter table public.feature_flags
  add column if not exists rollout_percentage integer not null default 100;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feature_flags_rollout_percentage_check'
      and conrelid = 'public.feature_flags'::regclass
  ) then
    alter table public.feature_flags
      add constraint feature_flags_rollout_percentage_check
      check (rollout_percentage between 0 and 100);
  end if;
end $$;

-- Suggested habits shown in the habit catalog
create table if not exists public.suggested_habits (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  icon        text not null default 'star',
  enabled     boolean not null default true,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- Immutable log of every admin action (WORM — write once read many)
create table if not exists public.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  admin_email   text not null,
  action        text not null,
  resource_type text,
  resource_id   text,
  details       jsonb,
  created_at    timestamptz not null default now()
);

-- Global notification banners (read by mobile/web clients)
create table if not exists public.global_notifications (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  type       text not null default 'info',   -- info | warning | success
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- Add is_pro column to profiles if it doesn't exist
alter table public.profiles add column if not exists is_pro boolean not null default false;
alter table public.profiles add column if not exists platform text;  -- 'ios' | 'android' | 'web'
alter table public.profiles add column if not exists coach_tone text not null default 'friendly';
alter table public.profiles add column if not exists pro_trial_started_at timestamptz;
alter table public.profiles add column if not exists pro_trial_ends_at timestamptz;
alter table public.profiles add column if not exists revenuecat_app_user_id text;
alter table public.profiles add column if not exists revenuecat_entitlement_id text;
alter table public.profiles add column if not exists revenuecat_product_id text;
alter table public.profiles add column if not exists revenuecat_store text;
alter table public.profiles add column if not exists revenuecat_period_type text;
alter table public.profiles add column if not exists revenuecat_latest_event_id text;
alter table public.profiles add column if not exists revenuecat_entitlement_active boolean not null default false;
alter table public.profiles add column if not exists revenuecat_status text not null default 'free';
alter table public.profiles add column if not exists pro_expires_at timestamptz;
alter table public.profiles add column if not exists subscription_synced_at timestamptz;
alter table public.profiles add column if not exists first_habit_logged_at timestamptz;
alter table public.profiles add column if not exists activation_engaged_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_coach_tone_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_coach_tone_check
      check (coach_tone in ('friendly', 'motivational', 'calm', 'strict', 'military'));
  end if;
end $$;

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table public.feature_flags         enable row level security;
alter table public.suggested_habits      enable row level security;
alter table public.admin_audit_log       enable row level security;
alter table public.global_notifications  enable row level security;

-- Authenticated users can read these (app uses them to gate features)
drop policy if exists "auth read feature_flags"        on public.feature_flags;
drop policy if exists "auth read suggested_habits"     on public.suggested_habits;
drop policy if exists "auth read global_notifications" on public.global_notifications;

create policy "auth read feature_flags"
  on public.feature_flags for select to authenticated using (true);

create policy "auth read suggested_habits"
  on public.suggested_habits for select to authenticated using (true);

create policy "auth read global_notifications"
  on public.global_notifications for select to authenticated using (active = true);

-- All writes go through service role key (no public write policies)

-- ── Seed Data ─────────────────────────────────────────────────────────────────

insert into public.feature_flags (key, name, description, enabled) values
  ('maintenance_mode',    'Maintenance Mode',      'Show a "Coming Back Soon" screen to all users during downtime',    false),
  ('leaderboard',         'Leaderboard',           'Enable the public competitive leaderboard',                        true),
  ('achievements',        'Achievements & Badges', 'Enable the XP, level, and badge system',                          true),
  ('social_feed',         'Social Feed',           'Enable public activity sharing and community feeds',               false),
  ('ai_suggestions',      'AI Habit Suggestions',  'Enable AI-powered personalised habit suggestions',                 false),
  ('push_notifications',  'Push Notifications',    'Enable sending push notifications to mobile devices',              true)
on conflict (key) do nothing;

insert into public.feature_flags (key, name, description, enabled, rollout_percentage) values
  ('activation_v2', 'Activation V2', 'Use the guided activation experience for a deterministic percentage of signed-in users', false, 0)
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    enabled = false,
    rollout_percentage = 0,
    updated_at = now();

insert into public.suggested_habits (name, description, icon, sort_order) values
  ('Drink Water',   'Stay hydrated — drink 8 glasses daily',                 'water_drop',      1),
  ('Morning Walk',  'Start your day with a refreshing walk outside',          'directions_walk', 2),
  ('Read',          'Read for at least 20 minutes every day',                 'menu_book',       3),
  ('Meditate',      'Practice mindfulness — even 5 minutes counts',           'self_improvement',4),
  ('Exercise',      'Get your daily workout in',                              'fitness_center',  5),
  ('Sleep Early',   'Get to bed by 10 pm for better rest',                   'bedtime',         6),
  ('Journal',       'Reflect on your day in writing',                        'edit_note',       7),
  ('No Sugar',      'Avoid sugary foods and drinks today',                   'nutrition',       8),
  ('Cold Shower',   'Build resilience with a cold shower',                   'shower',          9),
  ('Gratitude',     'Write down 3 things you are grateful for',              'favorite',        10)
on conflict do nothing;
