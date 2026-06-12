-- Proactive coach push notifications (edge function coach-push).
--
-- coach_push_sends caps proactive coach pushes at one per user per local day:
-- the function inserts before sending, so the unique constraint makes
-- overlapping cron runs lose the race instead of double-sending. Service-role
-- only, like web_push_sends.
--
-- The coach_push feature flag is the staged-rollout kill switch; it ships
-- disabled and is flipped manually per environment once the cron job and
-- secrets are in place (see the deploy notes in functions/coach-push/index.ts).

create table if not exists public.coach_push_sends (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  habit_id    uuid        not null,
  signal_kind text        not null,
  local_date  date        not null,
  sent_at     timestamptz not null default now(),
  -- One coach push per user per local day.
  unique (user_id, local_date)
);

create index if not exists coach_push_sends_user_date_idx
  on public.coach_push_sends (user_id, local_date);

alter table public.coach_push_sends enable row level security;

create policy "service_role_all" on public.coach_push_sends
  for all to service_role
  using (true) with check (true);

revoke all on public.coach_push_sends from anon, authenticated;

insert into public.feature_flags (key, name, description, enabled) values
  ('coach_push', 'Coach Push Notifications', 'Send proactive AI coach web push nudges (behind-progress midday, streak-risk evening)', false)
on conflict (key) do nothing;
