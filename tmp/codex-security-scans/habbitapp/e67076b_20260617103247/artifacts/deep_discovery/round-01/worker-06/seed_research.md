# Worker Seed Research

No CVE, GHSA, advisory, package-version, issue, or explicit vulnerability-family seed was supplied for worker `worker-06`.

Local seed derivation focused on repository-specific high-impact boundaries from the authoritative worklists:

- Supabase SECURITY DEFINER functions, grants, RLS policies, and standalone SQL setup files.
- Supabase Edge Functions using service-role credentials or `verify_jwt = false`.
- Next admin server actions and admin layout/authorization helpers.
- Auth callback and redirect handling.
- Push notification HMAC action-token flow.
- Website OG/API route and rendering/reflection sinks.
- Deployment/configuration files that can affect exposure.

Sources searched locally:

- `rank_input.csv` and `deep_review_input.csv` supplied by the parent orchestrator.
- `README.md` backend setup instructions.
- `supabase/config.toml`, `supabase/schema.sql`, `supabase/admin_schema.sql`, `supabase/get_leaderboard.sql`, and all `supabase/migrations/*.sql`.
- `supabase/functions/**`.
- `website/app/**`, `website/lib/**`, and `website/middleware.ts`.
- `lib/auth/**`, `lib/supabase/**`, `public/sw.js`, `cloudbuild.yaml`, `Dockerfile`, and `nginx.conf`.

Seed closure:

- `supabase/get_leaderboard.sql` remained open and was promoted as candidate `WD-001`: documented standalone SQL recreates a SECURITY DEFINER leaderboard RPC without revoking PUBLIC execute or checking `auth.uid()` before querying cross-user completion aggregates.
- `supabase/admin_schema.sql` was closed as suppressed for this pass: it is documented setup material and contains entitlement columns, but the current documented primary flow applies ordered migrations including `20260614120000_restrict_profiles_entitlement_writes.sql`, which revokes broad profile insert/update and grants only non-entitlement columns. The standalone file does not itself re-grant entitlement writes.
- Public/no-JWT Edge Functions were closed as suppressed where reviewed because each checked public function had a secondary secret or signed-token check before service-role impact.
- `.worktrees/**` copies were closed as dev-only unless used as explicit deployment/setup material.
