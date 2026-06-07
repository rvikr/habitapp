-- Welcome email on signup: fire the welcome-email edge function once a user's
-- email is confirmed. Covers OAuth users (confirmed at insert) and email/password
-- users (confirmed on a later update). The call is made via pg_net (asynchronous,
-- non-blocking) and authenticated with a shared secret read from Vault. pg_net is
-- already enabled (see 20260605065119_enable_cron_and_pg_net_for_web_push_reminders.sql).

alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz;

create or replace function public.notify_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'welcome_email_url'),
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-welcome-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'welcome_email_secret')
               ),
    body    := jsonb_build_object('user_id', new.id, 'email', new.email)
  );
  return new;
end;
$$;

revoke execute on function public.notify_welcome_email() from public;
revoke execute on function public.notify_welcome_email() from anon;
revoke execute on function public.notify_welcome_email() from authenticated;

-- OAuth / auto-confirmed signups: email_confirmed_at is already set at insert.
drop trigger if exists on_auth_user_welcome_insert on auth.users;
create trigger on_auth_user_welcome_insert
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.notify_welcome_email();

-- Email/password signups: email_confirmed_at transitions from null to set.
drop trigger if exists on_auth_user_welcome_confirm on auth.users;
create trigger on_auth_user_welcome_confirm
  after update on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.notify_welcome_email();

-- One-time Vault setup per environment (run in the SQL editor), mirroring the
-- documented progress-report setup in 0019_weekly_progress_reports.sql:
--
--   select vault.create_secret('https://<project-ref>.functions.supabase.co/welcome-email', 'welcome_email_url');
--   select vault.create_secret('<random-shared-secret>', 'welcome_email_secret');
--
-- The '<random-shared-secret>' must equal the WELCOME_EMAIL_SECRET set via
-- `supabase secrets set` on the edge function.
