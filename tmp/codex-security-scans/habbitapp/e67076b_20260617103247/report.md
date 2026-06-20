# Security Review: habbitapp

## Scope

- In scope: repository-wide scan of `C:\Users\rk\habbitapp` at commit `e67076b`.
- Scan mode: Codex Security Deep Security Scan, continued from completed worker discovery artifacts at `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247`.
- Context: threat model generated during scan from repository code and worker threat models.
- Validation mode: static source and migration trace; no live Supabase deployment or Web Push runtime harness was available.
- Limitation: after the completed discovery round, the user instructed not to rerun agents, so the centralized tail uses the preserved completed worker data rather than launching additional discovery rounds.

### Scan Summary

| Field               | Value                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Reportable findings | 2                                                                                                                               |
| Severity mix        | medium: 2                                                                                                                       |
| Confidence mix      | medium: 2                                                                                                                       |
| Coverage            | 1,010 source-like worklist rows reviewed by workers; canonical validation focused on merged candidates and high-impact surfaces |
| Validation mode     | Static trace against source, migrations, and scheduled function code                                                            |
| Final markdown      | `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\report.md`                                     |
| Final HTML          | `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\report.html`                                   |

## Threat Model

# Overview

Lagan is a habit-tracking application with an Expo/React Native client, a Next.js website/admin surface, Supabase database migrations, and Supabase Edge Functions. The security-relevant runtime surfaces are authenticated mobile/web users, public website routes, scheduled Edge Functions that run with service-role credentials, admin-only Next.js server actions, and database RPC/RLS policies.

# Threat Model, Trust Boundaries, and Assumptions

- Authenticated end users are untrusted across user, subscription, habit, feedback, AI quota, and notification boundaries.
- Browser clients and mobile clients can bypass client-side validation and call Supabase tables, RPCs, and Edge Functions directly with their own JWTs.
- Supabase service-role Edge Functions are privileged and must not let user-controlled stored data choose arbitrary privileged network, data, or admin effects.
- Admin actions are high privilege and rely on server-side session checks plus an `ADMIN_EMAILS` allowlist.
- Scheduled functions are not public API surfaces, but they process stored user data and can create delayed cross-boundary effects.
- Operator-only setup scripts and documentation are in scope as deployment hazards when the README presents them as production setup inputs, but later ordered migrations are strong counterevidence when they supersede a standalone script.

# Attack Surface, Mitigations, and Attacker Stories

- Web push subscriptions: authenticated users can create/update their own `web_push_subscriptions` rows; scheduled service-role functions later read those rows and call outbound push delivery APIs.
- AI functions: authenticated Pro users can trigger Gemini-backed functions, with quota guards limiting cost and frequency.
- Support email: authenticated users can invoke a Resend-backed function; HTML output escapes user fields, but email cost/abuse limits rely mostly on client/database flow.
- OG image route: public GET route renders images from query parameters; fixed dimensions and constrained message helpers reduce impact.
- Admin site: server actions call `requireAdmin` and then use a service-role client for privileged mutations.
- Database migrations: RLS and explicit grants are the primary controls for user-owned data and privileged subscription/leaderboard/pro-access fields.

# Severity Calibration (Critical, High, Medium, Low)

- Critical: unauthenticated account takeover, service-role secret disclosure, broad cross-user data modification, or credible remote code execution from an exposed production surface.
- High: authenticated but realistic privilege escalation, meaningful cross-user data exposure, or strong SSRF/file/network impact reaching sensitive internal services.
- Medium: authenticated or delayed service-side request/control abuse with constrained payloads or uncertain internal target impact; bounded resource abuse with clear production cost or availability effect.
- Low: self-only issues, minor metadata exposure, weak abuse paths already constrained by quota/rate limits, or deployment-only hazards with strong checked-in counterevidence.

## Findings

| #   | Finding                                                                                                                                                   | Severity | Confidence |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| 1   | [Stored web-push endpoints let users steer reminder cron outbound requests](#1-stored-web-push-endpoints-let-users-steer-reminder-cron-outbound-requests) | medium   | medium     |
| 2   | [Stored web-push endpoints let users steer coach-push outbound requests](#2-stored-web-push-endpoints-let-users-steer-coach-push-outbound-requests)       | medium   | medium     |

### Confidence Scale

| Label  | Meaning                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| high   | Direct source, configuration, or runtime evidence supports the finding, with no material unresolved reachability or exploitability blocker.                               |
| medium | Source evidence supports a plausible issue, but runtime behavior, deployment configuration, role reachability, type constraints, or exploit reliability still need proof. |
| low    | Weak or incomplete evidence; include only when the user explicitly wants follow-up candidates in the final report.                                                        |

### [1] Stored web-push endpoints let users steer reminder cron outbound requests

| Field                | Value                                                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity             | medium                                                                                                                                                                                                                                                                  |
| Confidence           | medium                                                                                                                                                                                                                                                                  |
| Confidence rationale | Static source trace proves stored endpoint control reaches the reminder sender, but exact `web-push` runtime URL constraints were not reproduced locally.                                                                                                               |
| Category             | SSRF / server-side callback abuse                                                                                                                                                                                                                                       |
| CWE                  | CWE-918 Server-Side Request Forgery                                                                                                                                                                                                                                     |
| Affected lines       | `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:15`, `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46`, `supabase/functions/web-push-reminders/index.ts:135-137`, `supabase/functions/web-push-reminders/index.ts:219-249` |

#### Summary

Authenticated users can manage their own `web_push_subscriptions` rows, and the schema stores `endpoint` as unconstrained text. The reminder cron later runs with service-role credentials, reads every stored subscription, and passes the stored endpoint to `webPush.sendNotification`. There is no repository control that proves the endpoint came from a browser `PushSubscription` or that it belongs to an expected push-service origin.

#### Validation

Method: static code trace. The migration defines the unbounded endpoint column and owner write policy, while `web-push-reminders` selects `endpoint`, builds `pushSub`, and calls `webPush.sendNotification`. No endpoint allowlist, URL parser, scheme/host check, or server-side subscription provenance check was found. Runtime behavior of the external `web-push` library was not reproduced, so confidence remains medium.

#### Dataflow

Authenticated user-controlled row in `web_push_subscriptions.endpoint` -> service-role reminder cron selects subscription rows -> `pushSub.endpoint = sub.endpoint` -> `webPush.sendNotification(pushSub, ...)`.

#### Reachability

A signed-in user can write their own subscription row through the exposed Supabase table policy. The scheduled worker is cron-secret gated, but that only protects direct invocation; it still processes attacker-controlled stored endpoints during normal scheduled delivery when the user has due reminders. The outbound request shape is constrained to Web Push delivery, reducing but not eliminating server-side callback risk.

#### Severity

Medium. The attacker has a realistic authenticated source and can influence a service-side outbound destination, but exploitation is delayed by reminder timing and constrained by Web Push request semantics. Evidence that the runtime can reach internal HTTPS services or cloud metadata would raise severity; proof that `web-push` enforces only real browser push service origins would lower it.

#### Remediation

Validate endpoints server-side before insert/update and before send. Restrict endpoints to known push-service HTTPS origins, reject private/link-local/localhost destinations after DNS/IP normalization, store only subscriptions created through browser PushManager flows, and add tests for malicious endpoints in the scheduled sender. Consider per-user subscription limits and stale endpoint pruning independent of send failures.

### [2] Stored web-push endpoints let users steer coach-push outbound requests

| Field                | Value                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity             | medium                                                                                                                                                                                                                                                  |
| Confidence           | medium                                                                                                                                                                                                                                                  |
| Confidence rationale | Static source trace proves stored endpoint control reaches the coach-push sender, but exact `web-push` runtime URL constraints were not reproduced locally.                                                                                             |
| Category             | SSRF / server-side callback abuse                                                                                                                                                                                                                       |
| CWE                  | CWE-918 Server-Side Request Forgery                                                                                                                                                                                                                     |
| Affected lines       | `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:15`, `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46`, `supabase/functions/coach-push/index.ts:226-229`, `supabase/functions/coach-push/index.ts:347-353` |

#### Summary

The coach-push scheduled function independently consumes the same user-managed subscription endpoint data. When the feature flag and send conditions allow a coach push, the service-role worker groups subscriptions by user and sends to every stored endpoint without validating endpoint destination or provenance.

#### Validation

Method: static code trace. The migration permits authenticated users to manage rows containing arbitrary endpoint text. `coach-push` selects `id, user_id, endpoint, p256dh, auth, timezone, last_seen_at`, groups rows by user, and passes each stored endpoint to `webPush.sendNotification`. No destination validation appears in the function or schema. Runtime behavior of the external `web-push` package was not reproduced, so confidence remains medium.

#### Dataflow

Authenticated user-controlled row in `web_push_subscriptions.endpoint` -> service-role coach-push cron selects subscription rows -> grouped subscriptions retain `sub.endpoint` -> `webPush.sendNotification({ endpoint: sub.endpoint, ... }, ...)`.

#### Reachability

A signed-in user can seed the stored endpoint. The coach sender is cron-secret gated and feature-flagged, and delivery depends on eligible coach signals, but those are normal production preconditions for the scheduled workflow rather than counterevidence. The outbound request is constrained to Web Push semantics, which keeps this at medium severity.

#### Severity

Medium. This is an authenticated stored-destination control issue in a privileged scheduled workflow, with constrained payload/method and feature-gated timing. Evidence of reachable internal targets from the Edge Function environment would raise severity; a proven push-service-origin enforcement in `web-push` would lower it.

#### Remediation

Use the same endpoint validation/provenance guard as the reminder sender. Revalidate stored endpoints before sending, constrain origins to known browser push providers, reject private/network-local destinations after canonicalization, and add tests for malicious stored endpoints in `coach-push`. Add per-user subscription caps to limit fanout amplification.

## Reviewed Surfaces

# Reviewed Surfaces

| Surface                     | Risk Area                    | Outcome         | Notes                                                                                         |
| --------------------------- | ---------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| Web push reminders          | SSRF/callback abuse          | Reported        | Stored endpoints reach `webPush.sendNotification` in the reminder cron.                       |
| Coach push                  | SSRF/callback abuse          | Reported        | Same stored endpoint control reaches a separate scheduled sender.                             |
| Profiles entitlement writes | Authz / privilege escalation | Rejected        | Current migration set contains explicit column-level grants that close the self-upgrade path. |
| Support email               | Email/cost abuse             | Rejected        | Authenticated-only and escaped; server-side length/rate limits remain recommended.            |
| Habit routine AI            | AI resource abuse            | Rejected        | Pro and quota controls limit cost and reachability.                                           |
| Admin email allowlist       | Admin authz                  | Needs follow-up | Confirm deployed Supabase settings require email ownership before session issuance.           |
| OG card route               | Public render DoS            | Rejected        | Fixed dimensions and constrained copy keep impact low; input/rate limits are hardening.       |
| Standalone leaderboard SQL  | Deployment drift             | Needs follow-up | Do not reapply standalone SQL after ordered migrations; prefer migrations only.               |

## Open Questions And Follow Up

- Validate the deployed Web Push runtime with a disposable environment to confirm whether `web-push@3.6.7` rejects non-push-service HTTPS origins before making a network request.
- Confirm Supabase auth settings for the admin website: email confirmation should be required before a session can satisfy `ADMIN_EMAILS`.
- Remove or clearly deprecate `supabase/get_leaderboard.sql` from manual setup docs, or update it to match the latest restrictive migration.
