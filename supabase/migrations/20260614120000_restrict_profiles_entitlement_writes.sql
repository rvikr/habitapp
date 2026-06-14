-- Restrict which profiles columns an authenticated user may write.
--
-- Problem: the "profiles: owner update" RLS policy gates only the *row*
-- (auth.uid() = user_id), not the *columns*. Because the entitlement columns
-- (is_pro, revenuecat_*, pro_expires_at, pro_trial_*) live on the same row, any
-- authenticated user could PATCH their own profile to set is_pro = true (or the
-- revenuecat fields) and self-grant Pro — both has_pro_access() and the client's
-- resolveProAccess() trust those columns. There was no trigger or column grant
-- preventing it.
--
-- Fix: column-level GRANTs, which compose with RLS. The owner policy still
-- decides which row; these grants decide which columns. Entitlement columns
-- become writable only by roles that keep table-wide privileges — service_role
-- (the RevenueCat sync/webhook edge functions and the admin "grant Pro" action)
-- and SECURITY DEFINER functions like handle_new_user(), none of which are
-- affected by revoking from anon/authenticated.
--
-- The authenticated client only ever writes these columns (verified against the
-- app and website): display_name, avatar_style, avatar_seed, coach_tone,
-- platform, updated_at (+ user_id on insert/upsert).

revoke insert, update on table public.profiles from anon, authenticated;

-- user_id is needed on insert (and as the on-conflict target for upserts); it is
-- deliberately omitted from the UPDATE grant so a row can never be reassigned to
-- another user.
grant insert (user_id, display_name, avatar_style, avatar_seed, coach_tone, platform, updated_at)
  on table public.profiles to authenticated;

grant update (display_name, avatar_style, avatar_seed, coach_tone, platform, updated_at)
  on table public.profiles to authenticated;
