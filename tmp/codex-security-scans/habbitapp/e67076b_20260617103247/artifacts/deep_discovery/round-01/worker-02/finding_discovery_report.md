# Finding Discovery Report

Resolved target: repository-wide scan of `C:\Users\rk\habbitapp`

Worker: `round-01 / worker-02`

Threat model source of truth for this worker: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-02\threat_model.md`

Parent worklists consumed exactly as supplied:

- `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\rank_input.csv`
- `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\deep_review_input.csv`

No shared coordinator threat model was read or reused. This worker did not run the centralized validation phase, centralized attack-path-analysis phase, final report assembly, or repository edits.

## Discovery Summary

Two technically plausible candidate findings were emitted.

Both candidates are SSRF/callback-abuse instances where authenticated user-controlled `web_push_subscriptions.endpoint` values cross into scheduled service-role web-push sends. They share a source table but remain independently reachable through separate scheduled functions and send sinks.

A non-promoted deferred row was also recorded for the habit safety validator: the TypeScript code includes `validate-habit` in `AiFeature`, but the latest reviewed SQL quota function whitelist did not include `validate-habit`, causing likely fail-open behavior in the remote AI validator. Because local validation still blocks explicit policy patterns and the impact is safety/product-policy rather than a traditional security boundary, this was recorded in coverage rather than promoted as a security candidate.

## Candidates

### HABB-W02-001: Authenticated users can persist arbitrary web push endpoints that the web-push reminder cron later requests with service-role context

- Instance key: `ssrf:supabase/functions/web-push-reminders/index.ts:249`
- Taxonomy: CWE-918
- Validation recommended: yes

Affected locations:

- `source`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46`
- `source`: `lib/platform/notifications.web.ts:53-63`
- `root_control`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:12-20`
- `entrypoint/wrapper`: `supabase/functions/web-push-reminders/index.ts:123-137`
- `sink`: `supabase/functions/web-push-reminders/index.ts:219-249`

Attacker-controlled source:

An authenticated user can create/update their own `public.web_push_subscriptions` row. The normal app writes browser `PushSubscription` endpoints, but the repository also grants authenticated row ownership through RLS and does not add an endpoint destination constraint.

Vulnerable sink or broken control:

The scheduled `web-push-reminders` service-role function reads all subscription rows and passes `sub.endpoint` directly to `webPush.sendNotification`. No repository-local scheme/host/IP allowlist, private-address block, redirect policy, or endpoint provenance check was found.

Impact:

Potential SSRF/callback abuse from the Supabase Edge Function network context. Later validation should determine whether the Deno/web-push runtime permits non-standard, private, metadata, or redirecting endpoints and what network reachability exists.

Closest apparent control and why incomplete:

The cron secret protects triggering the scheduled batch, and browser PushManager produces legitimate endpoints in the normal UI path. Neither control constrains a stored endpoint row already accepted from an authenticated user through the Data API.

Candidate-local discovery support:

Static source/control/sink trace completed. Dynamic reproduction was intentionally not performed in this discovery-only worker. Proof gap: exact web-push library validation and Supabase Edge outbound network reachability.

### HABB-W02-002: Coach push cron reuses user-controlled web push endpoints for outbound sends without destination validation

- Instance key: `ssrf:supabase/functions/coach-push/index.ts:350`
- Taxonomy: CWE-918
- Validation recommended: yes

Affected locations:

- `source`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46`
- `root_control`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:12-20`
- `entrypoint/wrapper`: `supabase/functions/coach-push/index.ts:200-229`
- `sink`: `supabase/functions/coach-push/index.ts:347-352`

Attacker-controlled source:

Same authenticated `web_push_subscriptions.endpoint` row source as HABB-W02-001.

Vulnerable sink or broken control:

`coach-push` independently reads stored subscription endpoints and passes each endpoint to `webPush.sendNotification` without repository-local destination validation.

Impact:

Potential SSRF/callback abuse from a second scheduled service-role function. The candidate has additional runtime preconditions: the `coach_push` feature flag must be enabled and the user's local signal window must produce an eligible coach push.

Closest apparent control and why incomplete:

The `x-cron-secret` and feature flag constrain when the function executes. They do not enforce endpoint destination safety when the feature is enabled.

Candidate-local discovery support:

Static source/control/sink trace completed. Dynamic reproduction was intentionally not performed in this discovery-only worker. Proof gaps: runtime feature flag value, signal eligibility, and web-push library endpoint restrictions.

## Suppressed / Closed High-Impact Areas

- Next admin actions: `requireAdmin()` and admin layout enforce authenticated email allowlist before service-role actions.
- Auth callback redirects: `sanitizeNext()` restricts redirects to same origin.
- RevenueCat webhook: shared Authorization token is checked and entitlement state is refetched from RevenueCat before profile update.
- Subscription sync: caller JWT is verified and RevenueCat fetch/upsert uses `user.id`.
- Account deletion: caller JWT plus recent sign-in check are enforced before service-role deletion.
- Push completion: unauthenticated endpoint uses signed HMAC action token and verifies habit ownership.
- Leaderboard: direct view/RPC grants are service-role-only; Edge Function verifies user JWT.
- Support/welcome email: support message HTML is escaped; welcome email is secret-gated and fixed-template.
- AI coach/routine/smart-reminder functions: user JWT, Pro access, quota guard, and output sanitation/schema controls were observed.
- Profile entitlement writes: latest migration revokes authenticated writes to entitlement columns and grants only safe profile columns.

## Coverage Notes

The parent-provided worklists include generated caches, historical worktrees, design prototypes, docs/tests, and runtime source. This worker performed frontier review across the deployed security boundaries and emitted coverage rows for non-primary/generated categories rather than promoting findings from duplicate historical copies. No repository source files were edited.
