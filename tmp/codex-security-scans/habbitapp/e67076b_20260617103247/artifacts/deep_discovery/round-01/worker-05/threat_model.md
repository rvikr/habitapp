# Repository Threat Model: habbitapp

## Overview

`habbitapp` is the Lagan habit tracker repository. It has three production-facing surfaces:

- Expo/React Native app code under `app/`, `components/`, and `lib/`, shipped to iOS, Android, and web/PWA.
- A Next.js website/admin app under `website/`, including dashboard pages, admin pages, auth callback handling, share-card generation, and `/app` proxying to the Expo web app.
- Supabase backend assets under `supabase/`, including Postgres schema/RLS/migrations and Edge Functions for subscriptions, account deletion, leaderboard access, AI coaching, reports, email, and web push.

Important assets are user accounts and sessions, habit/completion/sleep/profile data, Pro entitlement state, AI quota/cost controls, push-subscription endpoints and action tokens, admin-only service-role operations, and secrets such as Supabase service role, RevenueCat, Gemini, Resend, VAPID, and cron/webhook shared secrets.

## Threat Model, Trust Boundaries, and Assumptions

Primary actors:

- Anonymous internet users can reach public website routes, auth callback routes, public OG/share-card routes, and Supabase functions deployed with JWT verification disabled.
- Authenticated users control their Supabase JWT, app requests, profile/display-name fields, habits, reminders, feedback, local recommendation payloads, and web-push subscription rows allowed by RLS.
- Admin users are selected by the `ADMIN_EMAILS` allowlist in `website/lib/admin/auth.ts` and can trigger service-role user, content, feedback, notification, and feature-flag actions.
- Scheduled database/cron callers invoke service-role Edge Functions with headers such as `x-cron-secret`, `x-welcome-secret`, or HMAC action tokens.
- External providers include Supabase Auth/Postgres/Edge Functions, RevenueCat, Gemini, Resend, web push services, Cloud Run, and app stores.

Trust boundaries:

- Public/authenticated client to Supabase RLS tables. RLS and column grants must preserve user ownership and prevent entitlement/profile privilege escalation.
- Client or public request to service-role Edge Functions. Any function using `SUPABASE_SERVICE_ROLE_KEY` must authenticate and bind caller identity before privileged reads or writes.
- Authenticated user data to scheduled service-role workers. Rows written by users, especially URLs/endpoints and notification metadata, become privileged inputs when cron workers later consume them.
- Admin web sessions to service-role mutations. Admin access depends on correct user identity binding, verified email assumptions, server action checks, and cookie/session integrity.
- Webhook/cron callers to service-role functions. Bearer/shared-secret checks, HMAC tokens, and provider re-fetches are the controls that prevent unauthenticated full-table scans, entitlement writes, and email sends.
- User content to HTML/email/image rendering and AI prompts. Text should be escaped, length-bounded, and treated as content rather than trusted instructions.

Assumptions:

- `EXPO_PUBLIC_*` and `NEXT_PUBLIC_*` values are public client configuration; service-role and provider secrets must not appear there.
- Supabase Auth project configuration is not fully represented in the repository. Findings relying on email confirmation or provider email-verification settings must preserve that as a validation question.
- Generated build outputs, `.next`, `.expo`, historical `.worktrees`, local design references, and local `tmp` scan artifacts are not product surfaces unless deployment evidence shows they ship.
- Later migrations are current controls, especially profile entitlement column grants and service-only leaderboard functions.

## Attack Surface, Mitigations, and Attacker Stories

Primary attack surfaces:

- Supabase Edge Functions: `complete-habit-from-push`, `web-push-reminders`, `coach-push`, `progress-report`, `welcome-email`, `revenuecat-webhook`, `sync-subscription`, `leaderboard`, `delete-account`, `support-email`, and AI helper functions.
- Supabase Postgres schema: RLS on user data tables, profiles, feedback/deletion tables, web-push tables, weekly reports, and admin/service-only tables; SQL functions such as `has_pro_access`, `consume_ai_quota`, `log_habit_completion`, and leaderboard RPCs.
- Next website: `/admin/*`, server actions, Supabase SSR cookie middleware, `/auth/callback`, `/api/og/card`, `/app` Cloud Run rewrites, login/settings/dashboard/leaderboard flows.
- Expo app: Supabase client writes, password reset/account deletion, RevenueCat subscription sync, notification registration, local storage/session persistence, and service worker action-token redemption.
- CI/deploy configuration: EAS/Cloud Build public build args, Docker/nginx static hosting, and Vercel/Cloud Run rewrites.

Existing mitigations observed:

- Owner-based RLS policies for primary user data and profile owner rows.
- Profile entitlement column grants in `20260614120000_restrict_profiles_entitlement_writes.sql` prevent users from self-granting Pro through writable profile columns.
- Service-only execution grants for sensitive RPCs such as `has_pro_access`, `consume_ai_quota`, and leaderboard service functions.
- HMAC action tokens for push completion with UUID/date/expiry validation.
- Shared-secret cron gates for scheduled push/progress/welcome functions, and RevenueCat webhook re-fetching subscriber state before entitlement writes.
- Next auth callback `next` sanitization restricts redirects to same-origin paths.
- Admin server actions call `requireAdmin`, and admin pages live under an admin layout with the same email allowlist.
- User content is often length-bounded and escaped before email/HTML rendering.

Realistic attacker stories:

- An authenticated user attempts to bypass RLS or column grants to read or modify another user's habit, completion, sleep, profile, subscription, or report data.
- An authenticated user stores data that a service-role cron later consumes, such as web-push endpoints, to make the backend perform unintended outbound requests.
- An unauthenticated internet user probes JWT-disabled Edge Functions and public Next routes for missing shared-secret gates, open redirects, SSRF, rendering DoS, or email/webhook abuse.
- A user attempts to self-grant Pro by writing profile entitlement fields, forging RevenueCat webhook state, or abusing subscription sync.
- An attacker with a stale or forged session attempts destructive account deletion, admin server actions, or cross-user admin mutations.

Out-of-scope or lower-priority stories:

- Bugs requiring filesystem or shell access on a developer machine are not product vulnerabilities unless they affect CI/deploy or shipped runtime assets.
- Public Supabase anon keys embedded in client build config are expected public configuration, not secrets by themselves.
- Cosmetic UI bugs, generic missing rate limits, and low-value metadata leaks are secondary unless they enable privilege escalation, sensitive data exposure, provider-cost abuse, or service-role misuse.

## Severity Calibration (Critical, High, Medium, Low)

Critical findings require clear evidence of account takeover, admin/service-role takeover, cross-user data compromise, arbitrary code execution, or direct leakage of service-role/provider secrets from a realistic public or authenticated attack surface.

High findings include paths that let one user modify/read another user's data, self-grant paid/admin privileges, invoke service-role functions without the intended secret/JWT boundary, or force backend workers to reach sensitive internal/provider endpoints with meaningful impact.

Medium findings include narrower service abuse, SSRF with uncertain internal impact, email/AI/provider-cost abuse by authenticated users, missing server-side bounds on public expensive renderers, weaker admin identity assumptions that depend on external Auth configuration, or privacy leaks limited to intended opt-in data plus metadata.

Low findings include self-only data tampering, low-impact open redirects without token leakage, exposed public configuration, missing headers, and implementation robustness bugs without a credible security boundary.
