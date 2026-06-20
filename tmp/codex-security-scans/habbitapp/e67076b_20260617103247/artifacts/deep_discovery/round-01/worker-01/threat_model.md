# Threat Model: habbitapp

## Overview

`habbitapp` is the Lagan habit-tracking product. The repository contains a root Expo/React Native app for iOS, Android, and Expo web/PWA, a Next.js website/admin application under `website/`, Supabase Postgres schema and migrations, and Supabase Edge Functions for AI coaching, reminders, subscription synchronization, account deletion, leaderboard, feedback email, welcome email, and web push delivery.

The main assets are user accounts and Supabase sessions, habit and completion data, sleep/step-related wellness data, profile and leaderboard identity fields, Pro entitlement state, RevenueCat subscription metadata, push subscription keys, account deletion workflows, admin-only user management features, service-role access to Supabase, cron shared secrets, VAPID private keys, Resend and Gemini API keys, and audit logs.

The primary runtime surfaces are:

- Expo app screens in `app/`, shared data/auth logic in `lib/`, and UI components in `components/`.
- Public PWA service worker and static assets in `public/`.
- Supabase RLS policies, security-definer functions, and grants in `supabase/schema.sql` and `supabase/migrations/`.
- Supabase Edge Functions in `supabase/functions/`.
- Next.js website pages, server actions, middleware, API routes, and admin surfaces in `website/`.
- Deployment and proxy configuration in `Dockerfile`, `nginx.conf`, `cloudbuild.yaml`, `eas.json`, and `website/next.config.ts`.

## Threat Model, Trust Boundaries, and Assumptions

The key trust boundaries are:

- Anonymous internet users to marketing pages, public assets, the PWA shell, auth callbacks, public OG image generation, and any Supabase function deployed with public or anon access.
- Authenticated Lagan users to Supabase RLS-protected tables, Edge Functions that accept user JWTs, the Next app area, client-side habit/profile/feedback/reminder APIs, and web push subscription storage.
- Admin users to the Next admin app, server actions backed by `SUPABASE_SERVICE_ROLE_KEY`, and cross-user data operations.
- Scheduled database/cron callers to service-role Edge Functions such as `web-push-reminders`, `coach-push`, `progress-report`, and `welcome-email`.
- Third-party services to RevenueCat webhook, RevenueCat API, Resend API, Gemini API, web push endpoints, Google OAuth, Sentry, and PostHog.
- Client-controlled local state to SecureStore/localStorage, service worker cache, notification responses, and offline queues.
- Database-stored user-controlled values to later service-role jobs and renderers, including habit names, reminder settings, profile display fields, feedback text, push subscription endpoints, and timezone strings.

Attacker-controlled inputs include login/signup credentials, OAuth callback parameters, route/search parameters, habit names/descriptions/settings, completion values and dates, feedback messages, profile display/avatar fields, notification permissions and push subscription rows reachable via authenticated Supabase Data API, service worker notification data delivered by the push channel, server action form data, and public OG card parameters. Operator-controlled inputs include environment variables, cron secrets, VAPID keys, RevenueCat secrets, Cloud Run rewrite URL, admin email allowlist, Supabase project settings, and deployment manifests. Developer-controlled inputs include code, migrations, config plugins, generated assets, tests, and build scripts.

Important invariants:

- User data queries and mutations must remain scoped to `auth.uid()` unless deliberately aggregated for public leaderboard-style features.
- Entitlement fields such as `is_pro`, `revenuecat_*`, `pro_trial_*`, and `pro_expires_at` must not be user-writable through regular authenticated clients.
- Edge Functions using service-role keys must authenticate callers before privileged reads/writes and must not let user-stored values select privileged network destinations, privileged database targets, or security-sensitive identities without a specific control.
- Admin pages and server actions must require a current session whose email is in `ADMIN_EMAILS`.
- Cron/scheduled functions must require shared secrets and must not be triggerable by ordinary anon keys alone.
- Public renderers and email/push templates must escape or schema-constrain user-controlled text.
- Service worker notification actions must rely only on signed, scoped, short-lived tokens for state changes.

## Attack Surface, Mitigations, and Attacker Stories

The repository already contains several material controls:

- Supabase client sessions use `auth.getUser()` for user identity rather than trusting local session state in key paths.
- Core habit, completion, sleep, feedback, deletion-request, profile, and push-subscription rows are protected by RLS policies tied to `auth.uid()`.
- Later migrations revoke authenticated writes to Pro entitlement columns and grant only selected profile columns to authenticated clients.
- Edge Functions that use service-role access generally verify JWTs or cron/shared secrets before privileged work.
- RevenueCat webhook re-fetches subscriber state from RevenueCat instead of trusting the webhook body alone.
- Push action completion tokens are HMAC-signed, scoped to one user/habit/date, and checked before service-role writes.
- Next admin layout and admin server actions both check the `ADMIN_EMAILS` allowlist.
- Public auth callback and login `next` handling constrain redirects to local paths/origin.
- Feedback email HTML escapes user content before interpolation.

Realistic attacker stories include:

- An authenticated user tries to access or mutate another user's habits, completions, sleep data, profile, feedback, subscription, or deletion records through Supabase Data API, RPCs, or server actions.
- An authenticated user tries to self-grant Pro by editing profile entitlement columns or triggering subscription sync for another identity.
- An authenticated user stores crafted values that are later processed by a service-role Edge Function, such as push subscription endpoint data, habit/reminder text, timezone, profile display names, or feedback.
- An unauthenticated internet user tries to invoke cron or webhook functions with only public app credentials.
- A malicious or compromised third-party service sends forged subscription, email, push, or AI responses.
- A regular user attempts prompt-injection or data exfiltration through AI habit, coach, reminder, or progress-report prompts.
- A user or attacker tries open redirects, XSS, cache poisoning, or service worker navigation abuse in web/PWA surfaces.
- An admin-session attacker attempts CSRF-like privileged server actions, account deletion, Pro grants, or user management changes.

Out of scope or usually lower impact: developer-only scripts and generated build caches unless deployed; `.worktrees`, `.stitch-design`, `.superpowers`, `.next`, and `website/.next` artifacts except as evidence of generated output; local promo/creative outputs; tests and documentation unless they show deployed behavior; ordinary wellness recommendation quality issues without a security boundary.

## Severity Calibration (Critical, High, Medium, Low)

Critical findings in this repository would require clear evidence of cross-user account takeover, unauthenticated or broadly reachable service-role data compromise, arbitrary code execution in a deployed server/Edge Function, direct exposure of service-role/VAPID/Resend/Gemini secrets, or a trivial cross-tenant data modification/read path affecting many users.

High findings include authenticated but realistic cross-user authorization bypasses, self-service Pro entitlement forgery, service-role SSRF/callback abuse with meaningful internal or privileged-network reachability, unsafe public webhook/cron invocation that runs full-table service-role jobs, account deletion bypasses, or AI/notification paths that expose sensitive user data across boundaries.

Medium findings include same-user data integrity flaws with meaningful security impact, narrower data leaks, stored untrusted content that reaches emails or public cards after incomplete escaping, limited CSRF on privileged but recoverable admin actions, user-controllable outbound requests with constrained destination classes, or weak controls that require significant preconditions.

Low findings include non-sensitive information disclosure, rate-limit gaps, minor cache or redirect issues without credential exposure, defensive-hardening gaps, and robustness bugs that do not cross user, admin, service-role, or third-party trust boundaries.
