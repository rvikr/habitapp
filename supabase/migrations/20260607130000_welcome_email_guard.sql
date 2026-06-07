-- Make the welcome-email trigger fail-safe. The triggers on auth.users must never
-- break a signup/confirmation transaction: if the Vault secrets aren't configured
-- yet (welcome_email_url / welcome_email_secret) or the net.http_post dispatch
-- raises for any reason, skip silently instead of rolling back auth.

create or replace function public.notify_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url    text;
  v_secret text;
begin
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'welcome_email_url';
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'welcome_email_secret';

    -- Email infra not configured yet — do nothing, never block auth.
    if v_url is null or v_secret is null then
      return new;
    end if;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'content-type', 'application/json',
                   'x-welcome-secret', v_secret
                 ),
      body    := jsonb_build_object('user_id', new.id, 'email', new.email)
    );
  exception when others then
    -- Welcome email is best-effort; log and continue so signup always succeeds.
    raise warning 'welcome-email dispatch failed: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function public.notify_welcome_email() from public;
revoke execute on function public.notify_welcome_email() from anon;
revoke execute on function public.notify_welcome_email() from authenticated;
