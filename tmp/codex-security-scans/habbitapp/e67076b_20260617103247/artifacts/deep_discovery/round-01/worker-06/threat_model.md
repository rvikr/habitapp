# habbitapp Repository Threat Model

## Overview

`habbitapp` is the Lagan habit-tracking product. The repository contains three primary runtime surfaces:

- Expo/React Native app under `app/`, `components/`, and `lib/`, shipped to iOS, Android, and web/PWA.
- Next.js website/admin surface under `website/`, including marketing pages, authenticated dashboard/settings/leaderboard pages, admin pages, server actions, and an OG image API route.
- Supabase backend under `supabase/`, including Postgres schema/RLS/migrations and Edge Functions for AI coaching, account deletion, subscriptions, web push, progress reports, support email, welcome email, and leaderboard access.

Important assets are Supabase auth sessions and refresh tokens, user habit/completion/sleep/feedback data, profile and leaderboard opt-in data, subscription/pro entitlement state, service-role credentials, AI provider credentials, RevenueCat webhook/API secrets, push subscription keys and HMAC action tokens, admin privileges, and audit records.

Non-runtime or lower-priority areas include generated build output (`dist/`, `.next/`), local worktrees under `.worktrees/`, creative/promo outputs, tests, docs, and local tool configuration. They matter when they are explicitly used as deployment/setup material or when they contain secrets, but they are not primary production surfaces by default.

## Threat Model, Trust Boundaries, and Assumptions

Primary actors:

- Anonymous internet users reaching public website pages, public OG/card routes, and Supabase Edge Functions configured with `verify_jwt = false`.
- Authenticated app users with Supabase JWTs using the Expo app, PWA, website dashboard, Supabase Data API, and authenticated Edge Functions.
- Admin users identified by `ADMIN_EMAILS` in the Next admin site.
- Trusted server-side scheduled callers using cron/shared secrets for progress reports, welcome email, web push reminders, and coach push.
- External service providers: Supabase Auth/Postgres/Edge Functions, RevenueCat, Gemini, Resend, Sentry, PostHog, web push endpoints, Apple/Google auth and app platforms.

Trust boundaries:

- Browser/mobile client to Supabase Data API and Edge Functions. RLS and JWT verification must prevent users from reading or mutating other users' rows.
- Client to Next website server. Cookie-backed Supabase sessions and server-side `getUser()` checks protect `(app)` pages and admin routes.
- Next admin server to Supabase service-role client. `requireAdmin()` and admin layout checks must gate every service-role operation.
- Public/no-JWT Edge Functions to service-role actions. These require independent secrets or signed tokens because Supabase gateway JWT verification is disabled.
- Database setup SQL and migrations to deployed Postgres state. Standalone SQL files documented as operator-run setup artifacts can reintroduce dangerous grants or SECURITY DEFINER functions.
- AI model boundary. User habit/profile context sent to Gemini must be bounded, quota-gated, and must not contain secrets or raw payment credentials.
- Push notification boundary. Push payloads may contain signed one-action tokens; verification must bind token to user, habit, local date, and expiry.

Attacker-controlled inputs include login/signup/reset flows, OAuth callback `next` parameters, app habit/profile/reminder/sleep/feedback forms, Supabase Data API row writes allowed by RLS, Edge Function JSON bodies and headers, support email content, AI prompt context generated from user data, leaderboard period/limit flags, OG card query parameters, push notification subscriptions, and documented deployment/setup order followed by operators.

Operator-controlled inputs include `.env*`, Cloud Build substitutions, Supabase/Vault secrets, cron URLs/secrets, `ADMIN_EMAILS`, RevenueCat product/entitlement configuration, and whether standalone SQL files are run after migrations.

Core invariants:

- A user can only read or mutate their own private habits, completions, sleep entries, feedback, progress reports, push subscriptions, profile-private fields, and subscription state unless an intentional public aggregate is exposed.
- Subscription/pro entitlement fields are writable only by service-role code, RevenueCat verification paths, or controlled admin actions, never directly by ordinary authenticated users.
- Service-role operations are reachable only after a strong server-side admin, JWT, shared-secret, or HMAC-token check.
- Public/no-JWT Edge Functions fail closed when their secondary secret or token is missing or invalid.
- SECURITY DEFINER SQL functions and views must not bypass RLS for anonymous users unless the output is intentionally public and bounded.
- Auth redirect and deep-link handling must not create open redirects or token leakage.
- User-controlled strings rendered in web, email, OG images, or notifications must be escaped or otherwise constrained.

## Attack Surface, Mitigations, and Attacker Stories

High-priority attack surfaces:

- Supabase RLS/policy/grant layer: `supabase/schema.sql`, migrations, profile entitlement grants, leaderboard service-only RPCs, and SECURITY DEFINER functions.
- Supabase Edge Functions using service-role keys: `delete-account`, `progress-report`, `leaderboard`, `web-push-reminders`, `coach-push`, `complete-habit-from-push`, `welcome-email`, `revenuecat-webhook`, subscription sync, and AI functions.
- Next admin routes/actions under `website/app/admin/**` and `website/lib/admin/**`.
- Auth/session/callback code in `website/middleware.ts`, `website/app/auth/callback/route.ts`, `lib/auth/**`, and `lib/supabase/client.ts`.
- Push notification service worker and HMAC token flow in `public/sw.js`, `supabase/functions/_shared/push-action-token.ts`, and related reminder functions.
- Database setup instructions and standalone SQL files documented in `README.md`.

Observed controls:

- Website protected app routes use `(app)/layout.tsx` with server-side Supabase `getUser()` redirect.
- Admin server actions call `requireAdmin()` before service-role mutations.
- Public/no-JWT Edge Functions checked in `supabase/config.toml` implement secondary controls: RevenueCat auth token, cron secrets, welcome secret, or HMAC action tokens.
- `complete-habit-from-push` verifies HMAC, expiry, UUID/date shape, habit ownership, and archived status before writing.
- RevenueCat webhook and sync paths re-fetch subscriber state from RevenueCat instead of trusting webhook/client body entitlement claims.
- Migration `20260614120000_restrict_profiles_entitlement_writes.sql` revokes broad profile writes and grants only non-entitlement columns to authenticated users.
- Leaderboard current runtime path goes through the `leaderboard` Edge Function, which verifies a JWT and uses service-role-only RPCs.

Out-of-scope or lower-priority stories:

- Attacks that require local filesystem access to a developer machine or manual editing of `.worktrees/` content are not primary product attacks unless those files are deployed or documented setup inputs.
- Generic missing headers, public anon keys, Sentry/PostHog public keys, or intended public marketing content are low severity unless chained to concrete account, tenant, or data-boundary compromise.
- Correctness bugs in habit scoring or reminders are security-relevant only if they cross authorization, payment, privacy, or privileged-service boundaries.

## Severity Calibration (Critical, High, Medium, Low)

Critical issues would include unauthenticated or near-unauthenticated service-role access that allows account deletion, entitlement grants, cross-user habit/sleep data modification, service-role key exposure, arbitrary code execution in deployed server/Edge Function paths, or direct exfiltration of secrets/refresh tokens.

High issues would include authenticated cross-user data access or mutation through broken RLS/RPCs, admin authorization bypass on service-role Next actions, forged RevenueCat or push-action flows that grant Pro or mutate another user's data, exploitable SSRF against internal/cloud metadata from a deployed server function, or meaningful SQL injection in SECURITY DEFINER functions.

Medium issues would include bounded disclosure of opted-in leaderboard/profile aggregates through a stale SECURITY DEFINER setup artifact, CSRF-like abuse of important same-user state changes when browser controls do not prevent it, stored HTML/email injection into admin-visible messages without broader account compromise, or bypasses that require an authenticated low-privilege user and expose limited data.

Low issues would include minor information disclosure, weak public security headers without a concrete exploit path, public analytics/anon keys, low-impact open redirects, UI-only spoofing, or developer-only tooling issues without deployment evidence.
