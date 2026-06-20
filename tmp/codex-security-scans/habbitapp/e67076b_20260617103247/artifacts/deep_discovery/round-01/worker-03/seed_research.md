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
