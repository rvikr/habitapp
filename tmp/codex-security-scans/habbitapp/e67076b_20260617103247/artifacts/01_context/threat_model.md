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
