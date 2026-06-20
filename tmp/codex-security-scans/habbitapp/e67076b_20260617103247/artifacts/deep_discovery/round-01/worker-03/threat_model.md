# Worker Threat Model: habbitapp

Scan target: repository-wide scan of `C:\Users\rk\habbitapp`
Worker: `round-01/worker-03`
Generated: 2026-06-17

This threat model was generated independently for this worker. It does not read, reuse, overwrite, or infer any shared coordinator threat model.

## System Overview

`habbitapp` is a cross-platform habit tracking application with:

- An Expo and React Native client, including web/PWA surfaces under the repository root.
- A Supabase backend with Postgres schema, row-level security, RPC functions, and Edge Functions.
- A Next.js `website/` application that serves marketing, auth callback, account, and admin surfaces.
- Server-side integrations with RevenueCat, Resend, PostHog, Sentry, Expo push, web push, and Google Gemini.
- Cloud deployment support through Docker, nginx, Cloud Build, and static web artifacts.

Security decisions are split across Supabase RLS and grants, Supabase Edge Function authorization, Next.js server-side auth wrappers, client-side entitlement checks, and deployment-time environment separation.

## Primary Assets

- User accounts, Supabase auth identities, profile metadata, and account deletion flows.
- Habit data, completion history, sleep entries, reminder settings, coaching preferences, and push subscriptions.
- Subscription and entitlement state, including `is_pro`, trial dates, RevenueCat customer IDs, entitlement activity, and expiry fields.
- Admin-only data: audit logs, feedback, feature flags, suggested habits, notifications, and user management actions.
- Server-side secrets: Supabase service role key, RevenueCat webhook/auth keys, Resend API keys, Gemini API key, cron secrets, push action HMAC secret, Expo access token, and web push private key.
- Notification action tokens and any email or push content derived from user data.

## Trust Boundaries

- Browser/mobile client to Supabase anon API. The client can be modified by an attacker, so RLS, grants, and Edge Function checks are authoritative.
- Browser/mobile client to Supabase Edge Functions. Authorization headers and per-function shared secrets must be validated before service-role use.
- Browser to Next.js website. Server components and server actions must enforce auth before using service-role clients.
- Next.js server and Edge Functions to third-party APIs. Outbound requests must be scoped to fixed providers or non-privileged user-controlled endpoints.
- Database SQL to application entitlement logic. Database-level write privileges and application-level entitlement reads must agree.
- Deployment config to runtime. Environment variables and service keys must not be exposed to client bundles or static assets.

## Attacker Model

Expected attackers include:

- Anonymous internet users reaching public website routes, auth callback routes, OG image routes, static assets, and no-JWT Edge Functions.
- Authenticated low-privilege users using modified clients, direct Supabase REST calls, direct RPC calls, and crafted Edge Function requests.
- Users attempting to self-upgrade subscription state, access other users' habit data, trigger global jobs, or send abusive support/push/email traffic.
- External webhook senders attempting to spoof RevenueCat or cron-triggered functions.
- Admin-authenticated users are trusted for admin actions, but admin access control mistakes are high impact because those pages use the service role key.

## High-Impact Attack Surfaces

### Supabase schema and RLS

RLS and grants are the main control for user-owned data. High-value review areas are owner policies on `profiles`, `habits`, `completions`, reminders, sleep entries, push subscriptions, admin tables, and security-definer RPC functions.

The highest-risk pattern is any mismatch between row-level owner policies and column-level write restrictions on privileged profile fields. Entitlement fields are used by both client code and server-side RPC/function logic to decide whether a user has Pro access.

### Supabase Edge Functions

Edge Functions often use the service role key after authenticating the caller. High-impact paths include account deletion, RevenueCat webhook processing, subscription sync, AI quota checks, push reminders, coach push, progress reports, support email, welcome email, and push completion actions.

The key security property is that service-role operations must be scoped to the verified user or to a strong shared secret/HMAC, and that no-JWT functions must add their own authentication.

### Next.js website and admin

The `website/` app has public pages, auth callbacks, account pages, and admin routes. Admin components and server actions use a service-role client after `requireAdmin()` or admin layout checks.

The highest-risk failures would be an unprotected admin route/action, service-role use before admin authorization, insecure auth redirect handling, or exposing service-role data through public route handlers.

### Notifications and action tokens

Push and web-push flows include cron-triggered scans, subscription records, and action tokens for completing a habit from a notification. The token signing secret and token claims must prevent cross-user or cross-habit writes.

### Third-party integrations

RevenueCat, Resend, Gemini, Expo push, and web push use secrets and outbound calls. High-impact failures would include spoofable webhooks, service-role writes based on untrusted third-party input without refetching, unbounded server-side requests to attacker-controlled internal services, or secret leakage into public bundles.

## Baseline Controls Observed

- Admin pages are nested under `website/app/admin/layout.tsx`, which calls `getCurrentUser()` and checks `ADMIN_EMAILS`.
- Admin server actions call `requireAdmin()` before creating or using service-role clients.
- `website/app/auth/callback/route.ts` sanitizes `next` to same-origin relative paths.
- `website/app/login/LoginForm.tsx` rejects absolute and protocol-relative `next` values.
- No-JWT Edge Functions reviewed add controls: RevenueCat shared secret plus provider refetch, cron secrets, authenticated user JWTs, or HMAC push action tokens.
- `complete-habit-from-push` verifies signed claims before writing a completion for the claimed user and habit.
- `delete-account` requires a verified Authorization token and a recent sign-in check before service-role deletion.
- `sync-subscription` verifies the user token and refetches RevenueCat state for the authenticated user.
- Later migration `20260614120000_restrict_profiles_entitlement_writes.sql` revokes broad profile writes and grants only safe profile columns to anon/authenticated roles.

## Priority Security Questions

1. Can an authenticated user directly write privileged entitlement fields in `profiles` through Supabase REST or SDK calls in any supported deployment path?
2. Can a non-admin reach any Next.js admin data fetch or server action that uses the service role key?
3. Can any no-JWT Edge Function be triggered without its compensating secret, HMAC, or user JWT?
4. Can service-role Edge Function operations be pointed at another user's records by changing request body fields?
5. Can public redirect, OG image, service worker, or support-email surfaces be used for open redirect, XSS, SSRF, or abuse with high security impact?
6. Are any secrets copied into public configuration, static web artifacts, logs, or client bundles?

## Severity Calibration

- Critical: unauthenticated or low-privilege path to service-role data modification across users, admin takeover, or secret disclosure.
- High: authenticated user can bypass RLS, access or alter another user's private data, or self-grant paid entitlements that unlock server-side resources.
- Medium: authenticated abuse requiring user interaction, limited-scope spoofing, replay, or resource exhaustion without cross-user data exposure.
- Low: hardening issues, local-only scripts, dev-only risks, or issues blocked by normal deployment assumptions.

## Discovery Focus

The main candidate-producing focus is the profile entitlement write boundary, because it connects a low-privilege authenticated source, database grants/RLS as the closest control, and Pro entitlement sinks in both client and server-side logic. Other high-impact families were reviewed and suppressed where concrete controls were present.
