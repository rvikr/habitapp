# Finding Discovery Report

Scan target: repository-wide scan of `C:\Users\rk\habbitapp`  
Worker: `round-01/worker-01`  
Threat model source: worker-local `threat_model.md`

## Summary

This worker found two technically plausible candidate findings. Both involve the same root-control family: authenticated users can manage rows in `public.web_push_subscriptions`, including the outbound `endpoint`, while service-role scheduled functions later send web push requests to those stored endpoints. The candidates are kept separate because the regular reminder sender and proactive coach sender are independently reachable operations with distinct trigger conditions and sink lines.

No top-level validation or attack-path phase was run. Candidate-local static trace evidence and attack-path facts were recorded as discovery support for later centralized validation and semantic merging.

## Candidates

### cand-001: Authenticated users can steer regular web-push reminder delivery to arbitrary stored endpoints

- Instance key: `ssrf:supabase/functions/web-push-reminders/index.ts:249`
- Ledger row id: `wl-004`
- CWE: CWE-918
- Affected locations:
  - `source`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:12-18`
  - `root_control`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46`
  - `closest_control`: `lib/platform/notifications.web.ts:41-63`
  - `entrypoint/wrapper`: `supabase/functions/web-push-reminders/index.ts:123-137`
  - `sink`: `supabase/functions/web-push-reminders/index.ts:219-249`

Attacker-controlled source: an authenticated user can write their own `web_push_subscriptions` row through the Supabase Data API, including `endpoint`, `p256dh`, `auth`, and `timezone`, while satisfying `user_id = auth.uid()`.

Broken control: the database policy and table schema do not prove that `endpoint` came from browser `PushManager` or constrain the destination host/scheme. The normal UI path does use `PushManager`, but that is client-side provenance and is bypassable through direct authenticated API writes.

Sink and impact: `web-push-reminders` runs as a cron-secret-gated service-role function, reads all stored subscription rows, constructs `pushSub` from `sub.endpoint`, `sub.p256dh`, and `sub.auth`, then calls `webPush.sendNotification`. This can become SSRF/callback abuse from the Edge Function to attacker-selected endpoints if the runtime and `web-push` library allow the selected destination. It may expose push request metadata and VAPID authorization material to attacker-controlled endpoints and may reach internal/cloud/LAN services depending on egress.

Closest apparent controls: `WEB_PUSH_CRON_SECRET` prevents direct job invocation, and the client normally writes real PushManager endpoints. These controls do not prevent a legitimate user from planting a stored endpoint consumed by the next scheduled run.

Validation recommended: yes. Central validation should confirm accepted URL schemes/hosts in `web-push@3.6.7` and Supabase Edge egress behavior.

### cand-002: Authenticated users can steer proactive coach push delivery to arbitrary stored endpoints

- Instance key: `ssrf:supabase/functions/coach-push/index.ts:350`
- Ledger row id: `wl-005`
- CWE: CWE-918
- Affected locations:
  - `source`: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:12-18`
  - `root_control`: `supabase/migrations/20260605153715_advisor_hardening.sql:132-136`
  - `closest_control`: `lib/platform/notifications.web.ts:41-63`
  - `entrypoint/wrapper`: `supabase/functions/coach-push/index.ts:200-229`
  - `sink`: `supabase/functions/coach-push/index.ts:347-353`

Attacker-controlled source: an authenticated user can plant or alter their own `web_push_subscriptions` row with an attacker-selected endpoint under the current hardened `owner_all` RLS policy.

Broken control: the proactive coach sender trusts the same endpoint field as a Web Push destination without a server-side allowlist or provenance proof.

Sink and impact: `coach-push` is an independent service-role cron path. When `coach_push` is enabled and a user has an eligible coach signal, the function groups subscriptions by user and calls `webPush.sendNotification` with each stored `sub.endpoint`. This creates a second independently reachable SSRF/callback sink from service-role infrastructure.

Closest apparent controls: `COACH_PUSH_CRON_SECRET`, VAPID configuration, daily dedupe, and the `coach_push` feature flag constrain when the job runs. They do not constrain already stored endpoints. The feature flag default is off in the migration, which should be considered during later attack-path calibration, but the shipped runtime path is present.

Validation recommended: yes. Central validation should confirm runtime enablement assumptions, `web-push` URL handling, and whether a crafted endpoint can receive requests outside normal browser push services.

## Suppressed / Closed High-Impact Areas

- Admin pages and server actions: closed by `website/app/admin/layout.tsx` and `requireAdmin` checks.
- Auth redirects: local-origin/path checks close open redirect candidates.
- Entitlement writes: latest profile grants restrict authenticated writes to non-entitlement columns.
- Account deletion: JWT plus recent sign-in check controls service-role deletion.
- RevenueCat webhook and sync: webhook token and RevenueCat refetch, or JWT-bound user id, control entitlement updates.
- AI endpoints: JWT, Pro/quota controls, bounded schemas, and lack of privileged tool execution suppress prompt-injection-to-security-impact candidates.
- Support email: user content is escaped in HTML email.
- Leaderboard: direct view/RPC access is locked down by later migrations and Edge Function requires JWT.
- Push action completion: HMAC token verification controls unauthenticated state change.
- Public OG card route: query parameters render as React text and do not select filesystem paths.

## Notes For Centralized Validation

The two promoted candidates depend on whether direct database writes to `web_push_subscriptions` are possible with the currently deployed grants and whether `web-push` plus the Supabase Edge runtime can be made to issue requests to attacker-selected non-push-service endpoints. The repository evidence is strong enough to carry both candidates forward, but runtime proof will decide reportability and severity.
