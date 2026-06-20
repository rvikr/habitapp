# worker-01

# Seed Research

No CVE, GHSA, advisory, release-note, issue, package-version, or user-specified vulnerability-family seed was supplied for this worker pass.

The parent-provided authoritative worklists were consumed as shared inputs:

- `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\rank_input.csv`
- `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\deep_review_input.csv`

Local seed/frontier searches focused on repository-specific high-impact surfaces: Supabase Edge Functions, service-role cron jobs, RLS grants, Next admin server actions, auth callbacks, service worker notification actions, public renderers, push subscription storage, subscription synchronization, account deletion, and AI quota/pro-access helpers.

No advisory-seeded rows were opened.


# worker-02

# Seed Research

No CVE, GHSA, advisory id, package-version advisory, external report, or vulnerability-family seed was supplied for this worker. Network advisory lookup was therefore not part of this phase.

Local seed sources consumed:

- Parent-provided authoritative worklists:
  - `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\rank_input.csv`
  - `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\deep_review_input.csv`
- Repository README for product/runtime surface mapping.
- Supabase function config and migrations for unauthenticated/service-role boundaries.
- Runtime files reviewed during frontier discovery:
  - `supabase/config.toml`
  - `supabase/functions/web-push-reminders/index.ts`
  - `supabase/functions/coach-push/index.ts`
  - `supabase/functions/complete-habit-from-push/index.ts`
  - `supabase/functions/_shared/push-action-token.ts`
  - `supabase/functions/revenuecat-webhook/index.ts`
  - `supabase/functions/sync-subscription/index.ts`
  - `supabase/functions/delete-account/index.ts`
  - `supabase/functions/support-email/index.ts`
  - `supabase/functions/welcome-email/index.ts`
  - `supabase/functions/progress-report/index.ts`
  - `supabase/functions/leaderboard/index.ts`
  - `supabase/functions/habit-routine/index.ts`
  - `supabase/functions/smart-reminders/index.ts`
  - `supabase/functions/coach-message/index.ts`
  - `supabase/functions/validate-habit/index.ts`
  - `supabase/functions/_shared/ai-guard.ts`
  - `supabase/functions/_shared/pro-access.ts`
  - `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql`
  - `supabase/migrations/20260612120000_coach_push_sends.sql`
  - `supabase/migrations/20260614120000_restrict_profiles_entitlement_writes.sql`
  - `supabase/migrations/20260529174021_0021_leaderboard_service_api.sql`
  - `supabase/migrations/20260529174032_0022_lock_down_leaderboard_views.sql`
  - `website/middleware.ts`
  - `website/app/auth/callback/route.ts`
  - `website/app/admin/layout.tsx`
  - `website/lib/admin/auth.ts`
  - `website/lib/supabase/admin.ts`
  - `website/app/admin/users/actions.ts`
  - `website/app/admin/system/actions.ts`
  - `website/app/admin/content/actions.ts`
  - `lib/platform/notifications.web.ts`
  - `public/sw.js`
  - `lib/data/actions.ts`
  - `lib/habits/validate.ts`
  - `lib/habits/validate-remote.ts`

Seed conclusions:

- No advisory-seeded exact target rows were opened.
- Local frontier discovery found two independently reachable SSRF/callback-abuse candidates in scheduled web-push sender functions.
- A non-promoted safety-control mismatch was recorded in coverage: `validate-habit` uses `enforceAiQuota(..., "validate-habit")`, but the latest reviewed SQL quota function whitelist observed in migrations did not include `validate-habit`. The app fails open to local validation when the remote AI path is unavailable. This is tracked as a deferred/safety-control row, not a promoted security candidate in this discovery pass.


# worker-03

# Seed Research: worker-03

Scan target: repository-wide scan of `C:\Users\rk\habbitapp`
Worker threat model source: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\threat_model.md`

## Inputs Consumed

- Authoritative rank input: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\rank_input.csv`
- Exhaustive deep review input: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\deep_review_input.csv`

Both parent-provided worklists were treated as read-only shared inputs. They were not regenerated, reranked, overwritten, or reinterpreted. The deep-review worklist contained 1010 rows; the repository security review prioritized the application, database, Edge Function, website, public asset, deployment, script, and configuration surfaces relevant to the worker threat model.

## Local Seed Themes

1. Supabase RLS and grants around `profiles`, especially entitlement columns.
2. Service-role use in Supabase Edge Functions after user JWT, shared secret, or HMAC checks.
3. Next.js admin pages and server actions that create service-role clients.
4. Public no-JWT Edge Functions configured in `supabase/config.toml`.
5. Redirect and public rendering endpoints in the website.
6. Push notification action tokens and cron-triggered push jobs.
7. Secret exposure boundaries between server-only environment variables and public client configuration.

## Candidate-Producing Seed

The profile entitlement boundary produced one candidate:

- `CS-W03-001`: deployment/schema path where privileged profile entitlement columns from `supabase/admin_schema.sql` are reachable through owner row update policies unless the later column-level grant hardening migration is applied.

This candidate is grounded in a concrete source-to-sink chain:

- Source: authenticated user-controlled Supabase REST/SDK update against their own profile row.
- Closest control: owner-only profile update RLS and column grants.
- Sink: Pro entitlement decisions in app data access and `has_pro_access()`.
- Impact: self-granted Pro entitlement and access to Pro-gated features/server work.

## Reviewed Seeds That Did Not Produce Candidates

- Admin service-role actions: protected by admin layout and `requireAdmin()`.
- Auth callback/login redirect handling: `next` is sanitized to same-origin relative paths.
- RevenueCat webhook: no JWT, but requires an auth token and refetches RevenueCat state before writes.
- Cron-like functions: guarded by per-function shared secrets.
- User Edge Functions using service role: user token is verified and writes are scoped to the verified user.
- Push action completion: HMAC token contains user, habit, date, action, and expiry claims; replay is limited to idempotent same-day completion.
- Public OG card rendering: user-controlled text is rendered through React/Satori, and style choices are allowlisted or defaulted.
- Service worker fetch handling: caching logic is same-origin only.

## External Research

No external vulnerability feed or web research was used for this worker pass. The discovery work was code-grounded and repository-local.


# worker-04

# Seed Research

No CVE, GHSA, advisory identifier, package-version advisory, or explicit vulnerability-family seed was supplied for this worker. The parent supplied authoritative repository-wide `rank_input.csv` and `deep_review_input.csv`; both were consumed as shared inputs and were not regenerated, reranked, overwritten, or reinterpreted.

Local seed/frontier lanes derived from the repository threat model and worklist:

- Service-role Edge Functions and no-JWT functions in `supabase/config.toml` and `supabase/functions/**`.
- Supabase RLS, grants, SECURITY DEFINER functions, and cross-user aggregate RPCs in `supabase/schema.sql` and `supabase/migrations/**`.
- Stored data later consumed by privileged cron/send workers, especially `web_push_subscriptions.endpoint`.
- Next admin server actions and `requireAdmin()` boundaries under `website/app/admin/**` and `website/lib/admin/**`.
- Outbound network/provider sinks: `webPush.sendNotification`, `fetch("https://api.resend.com/emails")`, RevenueCat subscriber fetches, and Gemini `generateContent` calls.
- OAuth/callback and route middleware in `website/app/auth/callback/route.ts` and `website/middleware.ts`.

Historical migration notes were treated as context only when later migrations explicitly fixed the issue. For example, profile entitlement self-grant and public profile overexposure are documented in migrations and then remediated with column grants and view/RPC restrictions; these were not promoted as current candidates.


# worker-05

# Seed Research

No external CVE, GHSA, advisory, issue, release, package-version, or named vulnerability-family seed was supplied for this worker pass.

I consumed the parent-provided authoritative worklists as read-only inputs:

- `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\rank_input.csv`
- `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\deep_review_input.csv`

Local repository context used as seed-like background:

- `README.md` for product surfaces, deployment model, Supabase functions, admin website, and public/client environment assumptions.
- `AUDIT.md` for prior locally documented security issues. Current code appears to contain mitigations for the previously noted open redirect, RevenueCat webhook trust, and cron secret comparison issues.
- Supabase migration and Edge Function comments identifying intentional JWT-disabled functions and their replacement controls.

No advisory-seeded exact rows were created. Coverage rows close repository-specific high-impact families from local code evidence.


# worker-06

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
