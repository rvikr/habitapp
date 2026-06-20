# Finding Discovery Report: worker-03

Scan target: repository-wide scan of `C:\Users\rk\habbitapp`
Threat model source: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\threat_model.md`

## Executive Summary

This worker pass produced one technically plausible candidate and suppressed the other reviewed high-impact families based on concrete controls observed in code.

The candidate concerns the database authorization boundary for profile entitlement fields. A later migration appears to address the issue for fully migrated deployments, but the repository also contains an admin schema path that adds the privileged fields without the same column-level write hardening. Because entitlement fields are trusted by both application and database logic, this remains a distinct candidate for centralized validation against actual deployment state.

## Candidate Summary

### CS-W03-001: Profile entitlement columns can be self-updated in admin-schema deployments without the later column grant hardening

Severity hint: high
Confidence: medium

Source:

- Authenticated user with a modified client or direct Supabase REST/SDK access.

Closest control:

- Owner update RLS on `public.profiles` plus column grants.

Sink:

- `resolveProAccess()` and `has_pro_access()` trust entitlement fields on the profile row.

Impact:

- Potential self-grant of Pro entitlement and access to Pro-gated app features or server-side Pro work for the attacker's account.

Affected locations:

- `supabase/admin_schema.sql` lines 49-63: privileged entitlement columns are added without local column-level grant restrictions.
- `supabase/migrations/0002_leaderboard.sql` lines 32-36: owner update policy constrains rows only.
- `supabase/migrations/20260605153715_advisor_hardening.sql` lines 106-110: owner update policy has the same row-only shape.
- `lib/subscription/access.ts` lines 35-77: profile fields determine `hasPro`.
- `supabase/migrations/0018_free_pro_subscriptions.sql` lines 28-46: `has_pro_access()` trusts the same profile fields.
- `supabase/migrations/20260614120000_restrict_profiles_entitlement_writes.sql` lines 22-31: later hardening is counterevidence for fully migrated deployments and should be validated centrally.

Discovery support facts:

- The later hardening migration explicitly revokes broad `profiles` writes from anon/authenticated and grants only safe columns, which indicates the repository authors recognized this exact authorization boundary.
- This worker did not run the top-level validation or attack-path phases. Candidate-local validation and attack-path facts were preserved only as discovery support inside the candidate JSONL and candidate ledger.

## Suppressed Areas

- Next.js admin service-role pages and actions: protected by admin layout and `requireAdmin()` checks.
- Auth callback and login redirects: sanitize `next` values to same-origin relative paths.
- RevenueCat webhook: requires an auth token and refetches provider state.
- Cron and no-JWT functions: reviewed functions use shared secrets, HMAC action tokens, or authenticated mode splits.
- User-scoped Edge Functions using service role: reviewed functions verify user JWTs and scope privileged operations to the verified user.
- Push completion action: signed token includes user, habit, date, action, and expiry; writes are idempotent for the same completion date.
- Public OG card route: query text is rendered as React text and style inputs are allowlisted/defaulted.
- Service worker fetch cache: same-origin only.
- Secret exposure: server-only keys are referenced from server contexts; local environment files were not opened.

## Artifacts Written

- Threat model: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\threat_model.md`
- Seed research: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\seed_research.md`
- Work ledger: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\work_ledger.jsonl`
- Raw candidates: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\raw_candidates.jsonl`
- Deduped candidates: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\deduped_candidates.jsonl`
- Dedupe report: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\dedupe_report.md`
- Repository coverage ledger: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\repository_coverage_ledger.md`
- Candidate ledger directory: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\findings\CS-W03-001`
