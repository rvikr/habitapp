# Threat Model: habbitapp

## Overview

`habbitapp` is the Lagan habit-tracking product. The repository contains three runtime surfaces that share one Supabase backend:

- Expo / React Native app in `app/`, `components/`, and `lib/`, shipped for iOS, Android, and web/PWA.
- Supabase Postgres schema, migrations, and Deno Edge Functions in `supabase/`.
- Next.js marketing, authenticated web app, and admin console in `website/`.

Primary assets are Supabase Auth sessions, user habit and completion data, profile data, sleep and health-derived activity data, push subscription endpoints and keys, AI quota/account-entitlement state, admin-only service-role operations, account deletion audit records, RevenueCat subscription state, and email/push delivery credentials. The repository also contains developer-only artifacts (`.next`, `.worktrees`, `.stitch-design`, `promo`, generated outputs, tests, and docs) that are not product surfaces unless copied into deployment.

## Threat Model, Trust Boundaries, and Assumptions

Main actors:

- Anonymous internet users reaching the marketing site, public app shell, auth callbacks, and public Supabase Edge Functions.
- Authenticated users controlling their own profile, habit, completion, sleep, feedback, reminder, push subscription, and AI request inputs.
- Admin users identified by `ADMIN_EMAILS` in the Next.js admin site, with access to service-role powered actions.
- Scheduled database/cron callers for report and push jobs, authenticated by shared cron secrets.
- External providers: Supabase Auth/Postgres/Edge Functions, RevenueCat, Resend, Google Gemini, Sentry, PostHog, browser push services, native app stores, and web push endpoint providers.

Important trust boundaries:

- Client to Supabase PostgREST/RPC: authenticated users must only read and mutate their own rows. RLS and column-level grants in `supabase/schema.sql` and migrations are the main controls.
- Client to Edge Functions: authenticated functions must verify the bearer token with `supabase.auth.getUser()` before service-role reads/writes. Functions marked `verify_jwt = false` in `supabase/config.toml` must have their own shared-secret or HMAC token boundary.
- Edge Functions to service-role Supabase client: once a function creates a service-role client, any missing pre-check can become cross-user data access, entitlement change, account deletion, quota mutation, or notification abuse.
- Next admin to service role: admin pages and server actions must enforce `ADMIN_EMAILS` through `website/app/admin/layout.tsx` and `website/lib/admin/auth.ts` before `website/lib/supabase/admin.ts` is used.
- Stored user data to rendering and notification surfaces: profile names, habit names/descriptions/units, support messages, notifications, and LLM outputs must remain escaped, bounded, and context-safe.
- Stored push subscription endpoints to scheduled outbound requests: authenticated users can persist browser push endpoint data, and scheduled functions later send outbound web-push requests with service credentials.
- AI and subscription controls: RevenueCat and admin-controlled profile entitlement columns decide paid access; AI quota functions enforce per-user limits before Gemini calls.

Assumptions:

- Supabase applies migrations in order, including later hardening migrations that restrict profile entitlement writes, leaderboard access, service-only RPCs, and cron secrets.
- `SUPABASE_SERVICE_ROLE_KEY`, provider API keys, cron secrets, webhook auth tokens, and HMAC push secrets are not exposed to clients.
- `.env.local` and other local developer secrets are not committed or deployed as static assets.
- The public PWA and Next site may be internet reachable. Edge Functions with disabled JWT verification should be treated as internet reachable unless protected by their function-level secret.

## Attack Surface, Mitigations, and Attacker Stories

High-value attack surfaces:

- Supabase RLS and SQL/RPC: owner policies on `habits`, `habit_completions`, `profiles`, `sleep_entries`, `feedback_reports`, `web_push_subscriptions`, and report tables; service-only RPCs such as leaderboard and AI quota functions.
- Edge Functions with service role: `delete-account`, `leaderboard`, `sync-subscription`, `revenuecat-webhook`, `progress-report`, `welcome-email`, `web-push-reminders`, `coach-push`, `complete-habit-from-push`, and AI helper functions.
- Next admin actions in `website/app/admin/**/actions.ts`, which can grant/revoke Pro access, reset passwords, verify email, hard-delete users, edit feature flags, notifications, content, and feedback.
- Auth callbacks and session middleware in `website/app/auth/callback/route.ts` and `website/middleware.ts`.
- Push and service worker code in `lib/platform/notifications.web.ts`, `public/sw.js`, and push Edge Functions.
- LLM request/response handling in `supabase/functions/*` and shared Gemini helpers.

Existing mitigations observed:

- Owner RLS policies on core user tables and composite ownership constraints for completions.
- Column-level grants preventing authenticated users from updating profile entitlement fields (`20260614120000_restrict_profiles_entitlement_writes.sql`).
- Service-only leaderboard views/RPCs after `20260529174032_0022_lock_down_leaderboard_views.sql`, with the public `leaderboard` Edge Function verifying a user JWT.
- Cron-secret gates on scheduled functions, including `progress-report`, `web-push-reminders`, and `coach-push`.
- HMAC action tokens for unauthenticated push completion (`_shared/push-action-token.ts`).
- Admin allowlist checks in both admin layout and server actions.
- HTML escaping in support email and React default escaping for app/admin rendering.
- Bounded request input, enum validation, and output schemas for AI-related Edge Functions.

Realistic attacker stories:

- An authenticated user attempts to read or mutate another user's habits, completions, sleep entries, profile, subscription state, reports, or push subscription rows by changing IDs in client/API requests.
- An authenticated user attempts to write profile entitlement columns or use server actions/Edge Functions to self-grant Pro.
- An unauthenticated internet user attempts to trigger service-role Edge Functions marked `verify_jwt = false`.
- A user with a valid account stores unexpected values that are later consumed by scheduled jobs, outbound fetches, notification rendering, emails, or admin screens.
- A compromised admin session invokes server actions with service-role impact.
- A malicious or compromised provider callback attempts to forge RevenueCat subscription events or email/push workflows.

Out-of-scope or lower-relevance stories:

- Local-only developer scripts, generated `.next` caches, historical `.worktrees`, design prototypes, docs, tests, and promo rendering scripts are not production attack surfaces unless the deployment copies them into a reachable service.
- Generic missing headers, version disclosure, or low-impact UI behavior is lower priority unless it enables account compromise, data exposure, or service-role misuse.
- Attacks requiring possession of service-role keys, cron secrets, RevenueCat secrets, or database owner credentials are assumed out of scope unless the repository exposes those secrets or a reachable path uses them incorrectly.

## Severity Calibration (Critical, High, Medium, Low)

Critical:

- Service-role key exposure or unauthenticated service-role function paths that allow cross-user data deletion, account takeover, entitlement writes, or broad PII export.
- RLS or RPC failures allowing authenticated users to read or modify other users' private habits, completions, sleep entries, deletion records, or subscription/admin state at scale.
- Account deletion, password reset, or admin action bypass without a valid admin identity.

High:

- SSRF or outbound callback abuse from service-role scheduled functions if attacker-controlled destinations can reach cloud metadata, internal Supabase/project services, or other sensitive network endpoints.
- Forged subscription/webhook paths that grant Pro or mutate entitlement state without provider verification.
- Stored XSS or unsafe template/rendering that executes in admin or authenticated app origin with session or privileged action impact.
- Broken HMAC/JWT validation allowing push action tokens or user-authenticated Edge Functions to write another user's completion data.

Medium:

- Same-user paid-feature abuse, AI quota bypass, safety or policy validation bypass, or spam/email/push abuse with bounded impact.
- User-controlled notification or email content injection where escaping limits script execution but can still create phishing or trust issues.
- Open redirects or callback confusion limited to same-origin navigation without token leakage.

Low:

- Low-sensitivity aggregate data exposure, harmless public stats, minor enumeration, generic error leakage, or security headers without a concrete exploit path.
- Correctness issues in developer-only tooling, tests, docs, or generated artifacts that are not deployed or privilege-bearing.
