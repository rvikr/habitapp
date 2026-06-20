# Seed Research

No CVE, GHSA, advisory id, package-version advisory, external report, or vulnerability-family seed was supplied for this worker. Network advisory lookup was therefore not part of this phase.

Local seed sources consumed:

- Parent-provided authoritative worklists:
  - `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\rank_input.csv`
  - `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\deep_review_input.csv`
- Repository README for product/runtime surface mapping.
- Supabase function config and migrations for unauthenticated/service-role boundaries.
- Runtime files reviewed during frontier discovery:
  - `supabase/config.toml`
  - `supabase/functions/web-push-reminders/index.ts`
  - `supabase/functions/coach-push/index.ts`
  - `supabase/functions/complete-habit-from-push/index.ts`
  - `supabase/functions/_shared/push-action-token.ts`
  - `supabase/functions/revenuecat-webhook/index.ts`
  - `supabase/functions/sync-subscription/index.ts`
  - `supabase/functions/delete-account/index.ts`
  - `supabase/functions/support-email/index.ts`
  - `supabase/functions/welcome-email/index.ts`
  - `supabase/functions/progress-report/index.ts`
  - `supabase/functions/leaderboard/index.ts`
  - `supabase/functions/habit-routine/index.ts`
  - `supabase/functions/smart-reminders/index.ts`
  - `supabase/functions/coach-message/index.ts`
  - `supabase/functions/validate-habit/index.ts`
  - `supabase/functions/_shared/ai-guard.ts`
  - `supabase/functions/_shared/pro-access.ts`
  - `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql`
  - `supabase/migrations/20260612120000_coach_push_sends.sql`
  - `supabase/migrations/20260614120000_restrict_profiles_entitlement_writes.sql`
  - `supabase/migrations/20260529174021_0021_leaderboard_service_api.sql`
  - `supabase/migrations/20260529174032_0022_lock_down_leaderboard_views.sql`
  - `website/middleware.ts`
  - `website/app/auth/callback/route.ts`
  - `website/app/admin/layout.tsx`
  - `website/lib/admin/auth.ts`
  - `website/lib/supabase/admin.ts`
  - `website/app/admin/users/actions.ts`
  - `website/app/admin/system/actions.ts`
  - `website/app/admin/content/actions.ts`
  - `lib/platform/notifications.web.ts`
  - `public/sw.js`
  - `lib/data/actions.ts`
  - `lib/habits/validate.ts`
  - `lib/habits/validate-remote.ts`

Seed conclusions:

- No advisory-seeded exact target rows were opened.
- Local frontier discovery found two independently reachable SSRF/callback-abuse candidates in scheduled web-push sender functions.
- A non-promoted safety-control mismatch was recorded in coverage: `validate-habit` uses `enforceAiQuota(..., "validate-habit")`, but the latest reviewed SQL quota function whitelist observed in migrations did not include `validate-habit`. The app fails open to local validation when the remote AI path is unavailable. This is tracked as a deferred/safety-control row, not a promoted security candidate in this discovery pass.
