# Finding Discovery Report: worker-05

## Scope and Inputs

Resolved target: repository-wide scan of `C:\Users\rk\habbitapp` (`habbitapp`).

Worker artifacts are written only under:

`C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-05`

Inputs consumed as read-only authoritative parent worklists:

- `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\rank_input.csv`
- `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\deep_review_input.csv`

Worker-specific threat model source of truth:

- `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-05\threat_model.md`

## Repository Surfaces Reviewed

Primary production/security surfaces reviewed from code evidence:

- Supabase Edge Functions under `supabase/functions/`, including JWT-disabled and service-role functions.
- Supabase schema/RLS/migrations governing habits, completions, sleep entries, profiles, Pro entitlement, AI quota, web push, leaderboard, weekly reports, feedback, and deletion audit.
- Next website/admin app under `website/`, including admin auth/server actions, middleware, auth callback, OG image route, dashboard/leaderboard/settings data paths, and service-role admin client.
- Expo app client paths that write Supabase data, register web-push subscriptions, redeem notification actions, sync subscriptions, and request account deletion.
- Deployment/config files relevant to public config versus secrets.

The parent worklists include generated build caches, local historical worktrees, local design references, and scan artifacts. Those are preserved in the coverage ledger as not-applicable or lower-priority deferred context when repository evidence shows they are not deployed product/runtime surfaces.

## Raw and Deduped Candidates

### CAND-W05-001: User-controlled web push endpoint can drive scheduled reminder SSRF

Affected locations:

- `root_control` `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:12-18` - `endpoint`, `p256dh`, `auth`, and `timezone` are stored without a database destination constraint.
- `root_control` `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46` - `owner_all` lets authenticated users manage their own subscription rows.
- `entrypoint/wrapper` `lib/platform/notifications.web.ts:53-63` - legitimate browser path upserts the same row shape, but this is client-side only.
- `sink` `supabase/functions/web-push-reminders/index.ts:219-249` - service-role cron worker sends to the stored endpoint via `webPush.sendNotification`.

Attacker-controlled source: authenticated user table writes to `public.web_push_subscriptions` for their own `user_id` through Supabase APIs.

Broken control/sink: RLS proves ownership only; it does not prove endpoint scheme/host or real PushManager origin. The scheduled service-role worker consumes the endpoint as an outbound network destination.

Impact: potential SSRF or arbitrary outbound callback from Supabase Edge Function infrastructure, plus repeated provider-cost/delivery abuse. Validation should determine web-push library endpoint restrictions and platform egress reachability.

Taxonomy: CWE-918, CWE-20.

### CAND-W05-002: User-controlled web push endpoint can drive coach-push SSRF

Affected locations:

- `root_control` `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:12-18` - shared endpoint column lacks destination constraints.
- `root_control` `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46` - users can manage own endpoint rows.
- `entrypoint/wrapper` `supabase/functions/coach-push/index.ts:227-240` - service-role worker reads all subscription rows.
- `sink` `supabase/functions/coach-push/index.ts:347-353` - stored endpoint is passed to `webPush.sendNotification`.

Attacker-controlled source: authenticated user-owned push subscription row.

Broken control/sink: the cron secret authenticates the batch trigger, but not the destinations selected from user-writable rows.

Impact: a distinct scheduled service-role path can make outbound requests to attacker-selected endpoints when the feature flag and send-window conditions are met.

Taxonomy: CWE-918, CWE-20.

### CAND-W05-003: Admin authorization trusts allowlisted email without repository-enforced verification state

Affected locations:

- `root_control` `website/lib/admin/auth.ts:9-15` - `requireAdmin` checks only `user.email` membership in `ADMIN_EMAILS`.
- `entrypoint/wrapper` `website/app/admin/layout.tsx:14-19` - page-level admin gate uses the same email allowlist assumption.
- `sink` `website/app/admin/users/actions.ts:34-75` - service-role user reset, verify, and delete actions.
- `sink` `website/app/admin/system/actions.ts:8-56` - feature flag and global notification mutations.

Attacker-controlled source: a Supabase user identity whose email claim may be attacker-selected if email confirmation/provider verification is permissive or misconfigured.

Broken control/sink: no repository-enforced `email_confirmed_at`, provider `email_verified`, immutable admin role, or database admin membership check before service-role admin actions.

Impact: conditional admin takeover and service-role mutations if deployed Auth settings allow unverified allowlisted emails to sign in.

Taxonomy: CWE-287, CWE-863.

### CAND-W05-004: Public OG card renderer lacks query length and numeric bounds before expensive ImageResponse rendering

Affected locations:

- `entrypoint/wrapper` `website/app/api/og/card/route.tsx:28-58` - public query parameters are parsed without length/range limits.
- `root_control` `website/app/api/og/card/route.tsx:55-61` - badge `name`/`tone` feed the render data without explicit caps.
- `sink` `website/app/api/og/card/route.tsx:64-151` - `ImageResponse` renders a PNG per request.

Attacker-controlled source: anonymous query parameters to `/api/og/card`.

Broken control/sink: fixed output dimensions exist, but there are no repository-local size/rate limits before image rendering.

Impact: possible public CPU/memory/rendering-cost amplification. Lower priority unless centralized validation shows single-request exhaustion or absent platform throttling.

Taxonomy: CWE-400, CWE-770.

### CAND-W05-005: Authenticated support-email function bypasses client/database feedback bounds before sending email

Affected locations:

- `entrypoint/wrapper` `supabase/functions/support-email/index.ts:48-65` - authenticates any Supabase user JWT.
- `root_control` `supabase/functions/support-email/index.ts:67-82` - only checks message is nonempty and weakly normalizes category/rating.
- `sink` `supabase/functions/support-email/index.ts:96-108` - sends email through Resend.
- `closest_control` `lib/utils/feedback.ts:19-31` - client/database feedback path has validation that direct function calls can bypass.

Attacker-controlled source: authenticated direct Supabase Functions invocation body.

Broken control/sink: server-side email function does not enforce `validateFeedback` or database `message` length/rating bounds before provider send.

Impact: authenticated support-inbox/provider-cost abuse with oversized or repeated messages. HTML injection is mitigated by `escapeHtml`, so this is not an XSS/email-HTML injection candidate.

Taxonomy: CWE-400, CWE-770.

## Notable Suppressions and Counterevidence

- `complete-habit-from-push`: suppressed as auth bypass/cross-user write because HMAC action tokens validate signature, UUIDs, date, and expiry, and the function looks up habit id plus user id before service-role upsert. The database also has `(habit_id,user_id)` owner FK evidence.
- `revenuecat-webhook`: suppressed as entitlement forgery because it checks a shared Authorization token and re-fetches subscriber state from RevenueCat before writing profile entitlement fields.
- `sync-subscription`: suppressed as cross-user entitlement update because it authenticates the Supabase JWT and fetches RevenueCat by `user.id` before service-role profile upsert.
- Profile self-Pro write: suppressed because current migration `20260614120000_restrict_profiles_entitlement_writes.sql` revokes profile table insert/update from authenticated users and grants only non-entitlement columns.
- Admin server actions missing local guards: suppressed for the action files because each reviewed mutation calls `requireAdmin`; `CAND-W05-003` preserves the shared identity-binding assumption instead.
- Auth callback open redirect: suppressed because `sanitizeNext` rejects cross-origin destinations and returns only same-origin path/search/hash.
- Scheduled progress/welcome/push functions missing auth: suppressed where shared-secret gates are present; the retained push candidates concern user-controlled stored destinations after successful cron auth.
- RCE/command injection, filesystem traversal, unsafe deserialization, XML/XXE, and SQL injection: no concrete source-to-dangerous-sink tuple was identified in the reviewed production surfaces. Supabase query-builder use, static SQL functions, RLS, and service-role gates were the closest controls observed.

## Artifact Index

- Threat model: `threat_model.md`
- Seed research: `seed_research.md`
- Work ledger: `work_ledger.jsonl`
- Raw candidates: `raw_candidates.jsonl`
- Dedupe report: `dedupe_report.md`
- Deduped candidates: `deduped_candidates.jsonl`
- Coverage ledger: `repository_coverage_ledger.md`
- Per-candidate ledgers: `findings/<candidate_id>/candidate_ledger.jsonl`
