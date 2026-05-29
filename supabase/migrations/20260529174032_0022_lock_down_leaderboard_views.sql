-- Lock down public leaderboard/profile views and remove the old public RPC.

alter view public.public_profiles
set (security_invoker = true);

alter view public.leaderboard
set (security_invoker = true);

revoke all privileges on table public.public_profiles from public, anon, authenticated;
revoke all privileges on table public.leaderboard from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.get_leaderboard(text)') is not null then
    revoke execute on function public.get_leaderboard(text) from public, anon, authenticated;
  end if;
end $$;

drop function if exists public.get_leaderboard(text);

notify pgrst, 'reload schema';
