-- Web Push subscription storage for the installed PWA.
--
-- web_push_subscriptions stores one row per browser/device push endpoint.
-- The edge function web-push-reminders reads all rows (via service_role),
-- sends notifications, and prunes stale endpoints (404/410 from the push
-- service). The client upserts its own row after Notification.requestPermission
-- is granted; RLS limits each user to their own subscriptions.
--
-- web_push_sends is a dedupe log so the sender never fires twice for the same
-- habit reminder in the same local-date window.

create table if not exists public.web_push_subscriptions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  endpoint      text        not null unique,
  p256dh        text        not null,
  auth          text        not null,
  timezone      text        not null default 'UTC',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists web_push_subscriptions_user_id_idx
  on public.web_push_subscriptions (user_id);

create table if not exists public.web_push_sends (
  id               uuid        primary key default gen_random_uuid(),
  subscription_id  uuid        not null references public.web_push_subscriptions(id) on delete cascade,
  habit_id         uuid        not null,
  reminder_time    text        not null,
  local_date       date        not null,
  sent_at          timestamptz not null default now(),
  -- One send per subscription+habit+time+day.
  unique (subscription_id, habit_id, reminder_time, local_date)
);

-- RLS -------------------------------------------------------------------------

alter table public.web_push_subscriptions enable row level security;
alter table public.web_push_sends         enable row level security;

-- Users can manage their own subscriptions.
create policy "owner_all" on public.web_push_subscriptions
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Service role has full access for the push sender edge function.
create policy "service_role_all" on public.web_push_subscriptions
  for all to service_role
  using (true) with check (true);

create policy "service_role_sends" on public.web_push_sends
  for all to service_role
  using (true) with check (true);
