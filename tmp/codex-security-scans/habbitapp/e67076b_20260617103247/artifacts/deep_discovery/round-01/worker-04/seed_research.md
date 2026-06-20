# Seed Research

No CVE, GHSA, advisory identifier, package-version advisory, or explicit vulnerability-family seed was supplied for this worker. The parent supplied authoritative repository-wide `rank_input.csv` and `deep_review_input.csv`; both were consumed as shared inputs and were not regenerated, reranked, overwritten, or reinterpreted.

Local seed/frontier lanes derived from the repository threat model and worklist:

- Service-role Edge Functions and no-JWT functions in `supabase/config.toml` and `supabase/functions/**`.
- Supabase RLS, grants, SECURITY DEFINER functions, and cross-user aggregate RPCs in `supabase/schema.sql` and `supabase/migrations/**`.
- Stored data later consumed by privileged cron/send workers, especially `web_push_subscriptions.endpoint`.
- Next admin server actions and `requireAdmin()` boundaries under `website/app/admin/**` and `website/lib/admin/**`.
- Outbound network/provider sinks: `webPush.sendNotification`, `fetch("https://api.resend.com/emails")`, RevenueCat subscriber fetches, and Gemini `generateContent` calls.
- OAuth/callback and route middleware in `website/app/auth/callback/route.ts` and `website/middleware.ts`.

Historical migration notes were treated as context only when later migrations explicitly fixed the issue. For example, profile entitlement self-grant and public profile overexposure are documented in migrations and then remediated with column grants and view/RPC restrictions; these were not promoted as current candidates.
