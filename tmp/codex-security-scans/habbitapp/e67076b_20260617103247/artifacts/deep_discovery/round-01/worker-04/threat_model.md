# Repository Threat Model: habbitapp

## Overview

`habbitapp` is the Lagan habit-tracking product repository. It contains a cross-platform Expo application, an exported Expo web/PWA deployment served by nginx/Cloud Run, a separate Next.js marketing/admin website, Supabase database schema and migrations, and Supabase Edge Functions for account deletion, AI features, leaderboard access, push reminders, subscription sync, and email notifications.

The primary assets are Supabase user accounts and sessions, user-owned habit/completion/sleep/profile/feedback data, subscription entitlement state, administrator service-role privileges, AI and email provider API quota, web-push subscription material, VAPID/private signing secrets, HMAC action-token secrets, cron/shared secrets, and production deployment configuration.

Primary runtime surfaces include:

- Expo client routes under `app/`, shared client data/actions under `lib/`, and web service worker `public/sw.js`.
- Next.js website and admin app under `website/`, including `/auth/callback`, admin layouts/actions, middleware, and OG image generation.
- Supabase RLS/schema/migrations under `supabase/`.
- Supabase Edge Functions under `supabase/functions/`.
- Cloud Run static deployment through `Dockerfile`, `nginx.conf`, and `cloudbuild.yaml`.

The repository also contains generated artifacts (`.next`, `.expo`), local design/prototype HTML, worktrees, outputs, docs, and tests. Those are useful for context and regression evidence, but they are not the main product attack surface unless deployment configuration or runtime code imports them.

## Threat Model, Trust Boundaries, and Assumptions

Important actors:

- Anonymous internet users can reach public marketing pages, public static app assets, unauthenticated Supabase Edge Functions intentionally deployed without JWT verification, and any public API routes.
- Authenticated users can use the Expo app, website app pages, Supabase Data API with the anon key, Supabase RPCs granted to `authenticated`, and JWT-protected Edge Functions.
- Admin users are identified in the Next admin site by Supabase-authenticated email membership in `ADMIN_EMAILS`; admin server actions use a server-only Supabase service-role key.
- Scheduled database/cron jobs and service-role Edge Functions run with privileged Supabase access and can read/write across users.
- External services include Supabase Auth/PostgREST/Edge Functions, RevenueCat, Resend, Gemini, Sentry, PostHog, browser push services, Google Cloud Build, and Cloud Run.

Key trust boundaries:

- Client-controlled data crossing into Supabase tables and RPCs must be constrained by RLS, column grants, function grants, and database constraints.
- Client-controlled or stored data later used by service-role Edge Functions must be treated as attacker-controlled even if it was originally written through the normal app.
- Service-role functions must authenticate their callers before cross-user reads/writes, account deletion, entitlement updates, emails, AI calls, or push sends.
- Admin server actions must enforce `requireAdmin()` at the action boundary, not only in the admin layout.
- Public static/PWA content must not create open redirects, unsafe service-worker caching, or token exposure beyond the intended browser origin.
- External URL, email, push endpoint, and model-provider calls are egress boundaries; stored or request-supplied destinations/content need host, size, rate, and quota controls.

Assumptions for this scan:

- The latest migration sequence represents the intended deployed database state. Earlier migrations documenting fixed issues are historical evidence, not current findings when later migrations explicitly remediate them.
- Supabase anon keys and `EXPO_PUBLIC_*` values are public by design. Service-role keys, provider secrets, cron secrets, VAPID private keys, and HMAC action-token secrets are sensitive.
- The admin Next app and Expo static app are separately deployed surfaces.
- The supplied `rank_input.csv` and `deep_review_input.csv` are authoritative scan inputs for this worker; generated caches and worktree copies inside those files are treated as lower-priority unless runtime/deployment evidence makes them reachable.

## Attack Surface, Mitigations, and Attacker Stories

High-value attack surfaces:

- Supabase RLS and grants for user-owned rows (`habits`, `habit_completions`, `profiles`, `sleep_entries`, `feedback_reports`, `web_push_subscriptions`) and privileged service-only tables (`ai_usage_*`, admin audit logs, push send logs).
- SECURITY DEFINER functions and RPCs such as public stats, leaderboard functions, AI quota guards, pro access checks, completion-date helpers, and completion logging.
- Edge Functions that hold service-role credentials: account deletion, push reminder senders, coach push, progress report cron/generate-now, RevenueCat webhook, welcome/support email, AI feature endpoints, and leaderboard proxy.
- Stored subscription endpoints, habit/user content, feedback content, AI prompt inputs, and notification payload fields that cross from an authenticated user boundary into privileged outbound calls.
- Next admin server actions for granting/revoking Pro, deleting users, setting feature flags, suggested habit content, notifications, feedback status, and password recovery links.
- OAuth/callback flows and app/website rewrites that could become redirect or session-boundary bugs.

Existing mitigations observed:

- Owner-based RLS on core habit/completion/sleep/profile/feedback data.
- Column-level grants that restrict authenticated users from writing entitlement fields on `profiles`.
- Admin server actions call `requireAdmin()` before creating a service-role client.
- Edge Functions generally verify caller JWTs or shared secrets before service-role operations.
- Leaderboard aggregate access is proxied through a JWT-checked Edge Function and service-only RPC grants in later migrations.
- Feedback DB writes have database length/rating/category constraints.
- `nginx.conf` sets common security headers for the Expo web export.
- Auth callback sanitizes `next` to same-origin paths.

Realistic attacker stories:

- A normal authenticated user attempts to read or mutate another user's habit, completion, sleep, subscription, profile, or feedback data through Supabase Data API/RPCs.
- A normal authenticated user writes stored data that a service-role cron later consumes, causing cross-boundary egress, push amplification, email/AI quota consumption, or user-visible notifications.
- An unauthenticated internet user attacks no-JWT Edge Functions and must defeat shared-secret, HMAC-token, or webhook-token controls to reach service-role behavior.
- A non-admin authenticated website user tries to call server actions directly and bypass layout-only admin checks.
- A malicious admin or compromised admin session can perform destructive admin actions; this is mostly in-scope for auditability and least-privilege, but not a vulnerability by itself when the action is intentionally admin-only.

Out-of-scope or lower-value stories:

- A user modifying only their own local client cache or self-owned non-sensitive preferences without crossing a server trust boundary.
- Public anon key disclosure by itself.
- Generated design/prototype HTML or local worktree copies unless deployed or imported by runtime code.
- Generic missing headers on development artifacts when production nginx/Next deployment already owns the relevant header behavior.

## Severity Calibration (Critical, High, Medium, Low)

Critical:

- Unauthenticated or broadly reachable service-role misuse that deletes accounts, grants subscriptions, reads cross-user private data, sends privileged emails, or leaks service-role/provider secrets.
- SQL/RPC/RLS flaws that allow cross-tenant reads/writes of private habit, sleep, profile, subscription, or auth data at scale.
- Server-side request forgery from a service-role or cron environment to cloud metadata/internal services with clear attacker-controlled destination and credible sensitive response or side-effect impact.

High:

- Authenticated user bypass of RLS or service-role wrappers to access or modify another user's data.
- Admin-action authorization bypass enabling Pro grants, user deletion, global notifications, feature-flag changes, or password recovery actions.
- Stored attacker-controlled destinations or payloads that privileged scheduled jobs later send to network/file/provider sinks without sufficient host or cardinality controls.
- RevenueCat/webhook or HMAC action-token validation bugs that allow entitlement tampering or unauthorized habit completion for another user.

Medium:

- Authenticated resource abuse that consumes Resend/Gemini/web-push quota, causes batch-job degradation, or creates support/admin operational load without direct data compromise.
- Limited information exposure through public aggregate stats or leaderboard data where product design intentionally exposes some profile/activity metadata.
- Prompt/content injection that affects only the requesting user's AI output and does not cross into other users, secrets, or privileged actions.

Low:

- Self-only UI or data-integrity issues, weak client-side-only validation when server/database controls also enforce the boundary, and minor privacy or configuration hardening gaps without a demonstrated exploit path.
