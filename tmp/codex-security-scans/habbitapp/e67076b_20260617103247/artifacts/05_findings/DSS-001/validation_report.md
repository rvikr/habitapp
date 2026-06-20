# Validation Report: Stored web-push endpoints let users steer reminder cron outbound requests

Rubric:

- [x] Attacker-controlled source is present in the checked-in code.
- [x] Source reaches a privileged scheduled worker.
- [x] The worker performs an outbound request using the stored endpoint.
- [ ] Runtime behavior of the external `web-push` package was reproduced locally.
- [x] No repository-level allowlist or endpoint provenance check was found.

Method: static code trace.

Evidence: `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql` stores `endpoint` as text, owner RLS permits authenticated users to manage their own rows, and `supabase/functions/web-push-reminders/index.ts` passes that value to `webPush.sendNotification`.

Disposition: reportable.

Remaining uncertainty: runtime library behavior may constrain scheme/method/payload; this is reflected in medium confidence and medium severity.
