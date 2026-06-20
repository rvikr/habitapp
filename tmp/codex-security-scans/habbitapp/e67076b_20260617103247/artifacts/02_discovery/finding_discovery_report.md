# Finding Discovery Report

Canonical merged candidates passed to validation:

## DSS-001: Stored web-push endpoints let users steer reminder cron outbound requests

Instance key: ssrf:supabase/functions/web-push-reminders/index.ts:249
Affected locations:

- root_control: supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:15 - endpoint is stored as unconstrained text
- root_control: supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46 - authenticated users can manage their own subscription rows
- entrypoint/wrapper: supabase/functions/web-push-reminders/index.ts:135-137 - service-role cron reads stored endpoints
- sink: supabase/functions/web-push-reminders/index.ts:219-249 - stored endpoint is passed to webPush.sendNotification
  Attacker-controlled source: authenticated user-controlled `web_push_subscriptions.endpoint` stored through owner RLS.
  Broken control: no endpoint scheme/host/provenance constraint before service-role scheduled sender consumes the row.
  Sink: `webPush.sendNotification`.
  Impact: delayed server-side outbound request/callback abuse from privileged scheduled infrastructure; payload and method are constrained by Web Push library behavior.
  Validation recommended: yes.

## DSS-002: Stored web-push endpoints let users steer coach-push outbound requests

Instance key: ssrf:supabase/functions/coach-push/index.ts:350
Affected locations:

- root_control: supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:15 - endpoint is stored as unconstrained text
- root_control: supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46 - authenticated users can manage their own subscription rows
- entrypoint/wrapper: supabase/functions/coach-push/index.ts:226-229 - service-role coach cron reads stored endpoints
- sink: supabase/functions/coach-push/index.ts:347-353 - stored endpoint is passed to webPush.sendNotification
  Attacker-controlled source: authenticated user-controlled `web_push_subscriptions.endpoint` stored through owner RLS.
  Broken control: no endpoint scheme/host/provenance constraint before service-role scheduled sender consumes the row.
  Sink: `webPush.sendNotification`.
  Impact: delayed server-side outbound request/callback abuse from privileged scheduled infrastructure; payload and method are constrained by Web Push library behavior.
  Validation recommended: yes.
