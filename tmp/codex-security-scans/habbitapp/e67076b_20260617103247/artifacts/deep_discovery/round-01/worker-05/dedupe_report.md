# Dedupe Report

## Summary

Raw candidates reviewed: 5

Deduped candidates retained: 5

No raw candidates were merged away. `CAND-W05-001` and `CAND-W05-002` share the same user-writable `web_push_subscriptions.endpoint` root control, but they are independently reachable service-role cron sinks (`web-push-reminders` and `coach-push`) with separate scheduling/precondition paths, so they remain separate instances for validation.

## Retained Candidates

- `CAND-W05-001`: user-controlled endpoint to `web-push-reminders` webPush sink.
- `CAND-W05-002`: user-controlled endpoint to `coach-push` webPush sink.
- `CAND-W05-003`: admin allowlist trusts email without repository-enforced verification state.
- `CAND-W05-004`: public OG image renderer lacks input length/range bounds.
- `CAND-W05-005`: support-email direct function invocation bypasses client/database feedback bounds.

## Suppression Notes

- RevenueCat webhook body forgery was not retained because current code checks a shared Authorization token and re-fetches subscriber state from RevenueCat before writing profile entitlement fields.
- Progress-report, welcome-email, web-push-reminders, and coach-push all have shared-secret gates for cron/server-to-server invocation; retained push candidates concern user-controlled stored destinations consumed after those gates, not missing cron authentication.
- Complete-habit-from-push was not retained because the HMAC action token validates UUID/date/expiry and the function re-checks `(habit_id,user_id)` ownership before service-role upsert.
- Profile self-Pro escalation was not retained because the current `20260614120000_restrict_profiles_entitlement_writes.sql` migration revokes table-wide profile writes from authenticated users and grants only non-entitlement columns.
