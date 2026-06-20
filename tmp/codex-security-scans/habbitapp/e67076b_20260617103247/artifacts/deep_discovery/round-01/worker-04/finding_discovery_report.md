# Finding Discovery Report

Worker: `worker-04`  
Round: `round-01`  
Scope: repository-wide scan of `C:\Users\rk\habbitapp`  
Threat model source: `tmp/codex-security-scans/habbitapp/e67076b_20260617103247/artifacts/deep_discovery/round-01/worker-04/threat_model.md`

## Inputs Consumed

- Parent-provided authoritative rank input: `tmp/codex-security-scans/habbitapp/e67076b_20260617103247/artifacts/02_discovery/rank_input.csv`
- Parent-provided exhaustive deep-review input: `tmp/codex-security-scans/habbitapp/e67076b_20260617103247/artifacts/02_discovery/deep_review_input.csv`
- Both files contained 1010 rows and were consumed as supplied. They were not regenerated, reranked, overwritten, or reinterpreted.

The worklist includes primary runtime code plus generated caches, worktree copies, design artifacts, docs, tests, outputs, and lockfiles. This worker prioritized runtime/security-sensitive boundaries from the threat model and recorded non-runtime/generated/worktree coverage as not-applicable or deferred where no deployment/import evidence made those rows a primary product surface.

## Candidates

### CAND-W04-001: Stored web push endpoint can drive service-role reminder cron SSRF

- Instance key: `ssrf:supabase/functions/web-push-reminders/index.ts:249`
- Ledger row: `W04-COV-001`
- Affected locations:
  - `root_control`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:15` stores `endpoint` as unconstrained text.
  - `root_control`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46` lets authenticated users manage their own subscription rows through `owner_all`.
  - `entrypoint/wrapper`: `supabase/functions/web-push-reminders/index.ts:136-137` selects stored endpoints under the service-role cron worker.
  - `sink`: `supabase/functions/web-push-reminders/index.ts:220,249` places `sub.endpoint` into the push subscription object and passes it to `webPush.sendNotification`.
- Attacker-controlled source: authenticated user-controlled `web_push_subscriptions` row, either through normal PWA subscription storage or direct Supabase Data API writes.
- Broken control: no repository-visible scheme, host, IP, or known-push-service allowlist before the privileged worker sends to the stored endpoint.
- Impact: authenticated SSRF/callback abuse and egress from a privileged scheduled Edge Function; also outbound request amplification until invalid endpoints are pruned.
- Closest apparent control: row ownership, unique endpoint, and stale-endpoint pruning. These do not validate endpoint destination.
- Candidate-local validation support: static trace from table/RLS to service-role select to `sendNotification`. Dynamic validation should check the `web-push` library's URL restrictions and production egress policy.
- Validation recommended: yes.
- CWE: CWE-918, CWE-20.

### CAND-W04-002: Stored web push endpoint can drive service-role coach-push SSRF

- Instance key: `ssrf:supabase/functions/coach-push/index.ts:350`
- Ledger row: `W04-COV-002`
- Affected locations:
  - `root_control`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:15` stores unconstrained endpoint text.
  - `root_control`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46` permits authenticated owner writes.
  - `entrypoint/wrapper`: `supabase/functions/coach-push/index.ts:228-229` selects all stored endpoints.
  - `sink`: `supabase/functions/coach-push/index.ts:350-352` sends to `sub.endpoint`.
- Attacker-controlled source: authenticated user's stored subscription endpoint.
- Broken control: coach-push reuses the same stored endpoint without destination validation.
- Impact: independently reachable service-role SSRF/callback path when `coach_push` is enabled and signal/window preconditions are met.
- Closest apparent control: feature flag, cron secret, VAPID configuration, and eligible-signal gates affect worker execution but do not validate destination once a row is processed.
- Candidate-local validation support: static trace from stored endpoint to coach-push `sendNotification`. Dynamic validation should check library/runtime URL restrictions.
- Validation recommended: yes.
- CWE: CWE-918, CWE-20.

### CAND-W04-003: Direct support-email invocation bypasses feedback length/rating limits before Resend send

- Instance key: `resource-abuse:supabase/functions/support-email/index.ts:96`
- Ledger row: `W04-COV-004`
- Affected locations:
  - `entrypoint/wrapper`: `supabase/functions/support-email/index.ts:4` documents direct invocation for feedback email.
  - `root_control`: `supabase/functions/support-email/index.ts:74-81` trims message and requires only non-empty content.
  - `closest_control`: `lib/auth/validation.ts:20-27` enforces length/rating only in the client feedback flow.
  - `sink`: `supabase/functions/support-email/index.ts:96-106` sends the message to Resend.
- Attacker-controlled source: authenticated direct function request body.
- Broken control: the email function does not enforce server-side message length, rating bounds, or rate limits before provider send.
- Impact: authenticated users can bypass client and DB feedback constraints to send oversized or repeated support emails, consuming Resend quota and flooding the support inbox.
- Closest apparent control: JWT authentication, client-side validation, and feedback table constraints. They do not protect the direct email function boundary.
- Candidate-local validation support: static boundary comparison. Runtime validation should check platform/provider rate limits not visible in repo.
- Validation recommended: yes.
- CWE: CWE-770, CWE-400.

### CAND-W04-004: Habit routine AI endpoint forwards unbounded answers object to Gemini

- Instance key: `resource-abuse:supabase/functions/habit-routine/index.ts:248`
- Ledger row: `W04-COV-005`
- Affected locations:
  - `entrypoint/wrapper`: `lib/coach/routine-ai.ts:58-63` invokes `habit-routine` with `answers`.
  - `root_control`: `supabase/functions/habit-routine/index.ts:143-189` sanitizes `localRecommendations`, but not `answers`.
  - `closest_control`: `supabase/functions/habit-routine/index.ts:198-211` enforces Pro access and per-call AI quota.
  - `sink`: `supabase/functions/habit-routine/index.ts:221-249` embeds `body.answers` in the Gemini request.
- Attacker-controlled source: authenticated Pro caller-controlled `answers`.
- Broken control: no server-side schema, byte-size, depth, or token-size bound for `answers`.
- Impact: a Pro user can inflate provider input size, request latency, and Gemini cost while consuming only one quota unit.
- Closest apparent control: authentication, Pro access, and AI call-count quota. These do not bound prompt input volume.
- Candidate-local validation support: static trace. Runtime validation should measure Supabase/Gemini body/token limits.
- Validation recommended: yes.
- CWE: CWE-400, CWE-770.

### CAND-W04-005: Unbounded web push subscriptions can amplify scheduled push worker fanout

- Instance key: `resource-abuse:supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43`
- Ledger row: `W04-COV-003`
- Affected locations:
  - `root_control`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:12-24` defines unique endpoints but no per-user row cap or endpoint format constraint.
  - `root_control`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46` permits authenticated owner-managed subscription rows.
  - `sink`: `supabase/functions/web-push-reminders/index.ts:136-143,249-265` selects and sends/logs per due subscription.
  - `sink`: `supabase/functions/coach-push/index.ts:228-237,350-356` groups all user subscriptions and sends to each endpoint.
- Attacker-controlled source: authenticated user's ability to create many distinct endpoint rows.
- Broken control: no per-user subscription cap or server-side enrollment API that verifies browser-created subscriptions.
- Impact: scheduled worker database reads, per-row processing, outbound send attempts, and provider/API cost can be amplified by one authenticated user, potentially causing missed notifications when runtime limits are hit.
- Closest apparent control: endpoint uniqueness and 404/410 pruning. These do not cap valid or syntactically distinct endpoints.
- Candidate-local validation support: static cardinality trace. Runtime validation should quantify project limits and web-push behavior.
- Validation recommended: yes.
- CWE: CWE-770, CWE-400.

## Suppressed / Not Promoted Areas

- Admin server actions: reviewed user/content/system/feedback actions call `requireAdmin()` before service-role operations.
- RevenueCat webhook: requires webhook token and verifies entitlement state against RevenueCat before profile updates; latest migrations restrict authenticated writes to entitlement columns.
- Delete-account function: deletes only the authenticated caller and requires recent sign-in.
- Leaderboard functions: public client access is proxied by an authenticated Edge Function; service-only RPC grants are present in later migrations.
- Completion logging RPC: `security invoker`, uses `auth.uid()`, and is backed by owner RLS/FK constraints.
- OAuth callback: `next` is same-origin sanitized.
- Service worker action token: HMAC-signed, scoped to user/habit/date, expiring, and idempotent.
- Static app deployment: public Cloud Run exposure is intended for the exported PWA, with nginx security headers present.

## Residual Coverage Notes

The parent worklist is unusually broad for a runtime security review and includes `.worktrees`, `.next`, `.stitch-design`, `.superpowers`, outputs, docs, and tests. This worker did not treat those as primary deployed surfaces absent repository evidence of runtime import/deployment. The coverage ledger records that as non-primary/deferred rather than claiming full line-by-line review of generated or duplicate local material.
