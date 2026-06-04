-- Lock leaderboard aggregates behind the Edge Function service API.
-- Direct public/authenticated Data API access to these views can reveal
-- aggregate activity for opted-in users, so only service_role may read them.

revoke all on public.leaderboard from public;
revoke all on public.leaderboard from anon;
revoke all on public.leaderboard from authenticated;
grant all on public.leaderboard to service_role;

revoke all on public.public_profiles from public;
revoke all on public.public_profiles from anon;
revoke all on public.public_profiles from authenticated;
grant all on public.public_profiles to service_role;

revoke execute on function public.get_leaderboard_entries(text, integer, uuid) from public;
revoke execute on function public.get_leaderboard_entries(text, integer, uuid) from anon;
revoke execute on function public.get_leaderboard_entries(text, integer, uuid) from authenticated;
grant execute on function public.get_leaderboard_entries(text, integer, uuid) to service_role;

revoke execute on function public.get_leaderboard_position(uuid, text) from public;
revoke execute on function public.get_leaderboard_position(uuid, text) from anon;
revoke execute on function public.get_leaderboard_position(uuid, text) from authenticated;
grant execute on function public.get_leaderboard_position(uuid, text) to service_role;
