# Canonical Candidate Inventory

Terminal state: capped by user instruction not to rerun completed discovery agents; centralized validation uses the preserved completed worker outputs.

## DSS-001 - Stored web-push endpoints let users steer reminder cron outbound requests

Severity hypothesis: medium
Confidence: medium
Affected locations:

- root_control: supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:15 - endpoint is stored as unconstrained text
- root_control: supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46 - authenticated users can manage their own subscription rows
- entrypoint/wrapper: supabase/functions/web-push-reminders/index.ts:135-137 - service-role cron reads stored endpoints
- sink: supabase/functions/web-push-reminders/index.ts:219-249 - stored endpoint is passed to webPush.sendNotification

## DSS-002 - Stored web-push endpoints let users steer coach-push outbound requests

Severity hypothesis: medium
Confidence: medium
Affected locations:

- root_control: supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:15 - endpoint is stored as unconstrained text
- root_control: supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46 - authenticated users can manage their own subscription rows
- entrypoint/wrapper: supabase/functions/coach-push/index.ts:226-229 - service-role coach cron reads stored endpoints
- sink: supabase/functions/coach-push/index.ts:347-353 - stored endpoint is passed to webPush.sendNotification
