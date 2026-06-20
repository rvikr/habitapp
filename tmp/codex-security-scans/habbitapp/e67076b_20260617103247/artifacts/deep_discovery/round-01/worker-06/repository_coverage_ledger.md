# Worker Repository Coverage Ledger

This worker consumed the parent-provided authoritative `rank_input.csv` and `deep_review_input.csv` without regenerating, reranking, overwriting, or reinterpreting them.

The worklist contains 1,010 rows. It includes the primary runtime tree plus local worktrees, generated output, docs/tests, and creative artifacts. This worker prioritized production and privileged security boundaries and recorded non-runtime areas as not applicable unless they were documented deployment/setup inputs.

| ledger row id | boundary / shard | files checked | family | source / privileged boundary | sink / control | candidate ids | disposition | evidence summary |
|---|---|---|---|---|---|---|---|---|
| WL-001 | Supabase standalone SQL setup | `README.md`, `supabase/get_leaderboard.sql`, leaderboard hardening migrations | SECURITY DEFINER authz/data exposure | Documented backend setup file | Cross-user completion aggregate RPC | WD-001 | reportable candidate | Standalone SQL lacks PUBLIC revoke and auth-null guard while later migration documents those missing controls. |
| WL-002 | Public no-JWT Edge Functions | `revenuecat-webhook`, `progress-report`, `welcome-email`, `complete-habit-from-push`, HMAC helper | Missing auth/service-role abuse | Anonymous function entrypoints | Service-role writes, email sends, cron batches | none | suppressed | Secondary controls found before service-role impact: auth token, cron/welcome secret, or HMAC action token. |
| WL-003 | Authenticated and scheduled Edge Functions | AI functions, subscription sync, account deletion, leaderboard, coach/web push | Authz/quota bypass | User JWTs or cron secrets | Service-role reads/writes and external API calls | none | suppressed | JWT verification or shared-secret checks bind operations to verified users or trusted scheduled callers. |
| WL-004 | Next admin service-role surface | `website/app/admin/**`, `website/lib/admin/**` | Admin authz/privilege escalation | Admin browser session | Service-role admin mutations | none | suppressed | `requireAdmin()` and admin layout check `ADMIN_EMAILS` before service-role operations in reviewed actions. |
| WL-005 | Website/app auth callbacks | middleware, callback route, login form, native callback parsing | Open redirect/session/token leak | `next` and auth callback params | Redirect/session exchange | none | suppressed | Same-origin/local-path checks and PKCE/session storage controls observed. |
| WL-006 | Profile entitlement columns | profile RLS policies, entitlement migration, profile update clients | Payment bypass/mass assignment | Authenticated user profile writes | `is_pro`, `revenuecat_*`, trial/pro fields | none | suppressed | Current migration revokes broad profile writes and grants only non-entitlement columns. |
| WL-007 | Rendering/reflection/static content | OG image API, share messages, static HTML, service worker | XSS/content injection/open redirect | Query params, push payload data, local constants | ImageResponse, HTML, notification click | none | suppressed | User values render as text or are server-generated; no deployed script/HTML sink found. |
| WL-008 | Deployment/config/secrets | `.env.local`, examples, Cloud Build, Docker, nginx, app config | Secret exposure/misconfig | Repo-stored config | Client bundle/env and public deployment | none | suppressed | Public keys are client-intended; server/service secrets are referenced as env/Secret Manager/Supabase secrets. |
| WL-009 | Non-runtime worklist content | `.worktrees/**`, `.next/**`, `dist/**`, docs/tests/promo/output/design artifacts | Dev-only / generated | Local development artifacts | Not deployed by repository evidence | none | not_applicable | Reviewed as non-primary surfaces; duplicated security issues were checked against primary runtime files. |

Deferred rows:

- Full per-file receipts for every generated/worktree/doc row in the 1,010-row worklist are summarized by shard rather than individually enumerated in this worker artifact. The worker did not promote candidates from those rows without production deployment evidence.
