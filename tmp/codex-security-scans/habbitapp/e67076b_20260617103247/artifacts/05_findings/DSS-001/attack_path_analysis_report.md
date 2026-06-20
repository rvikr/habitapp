# Attack Path Analysis: Stored web-push endpoints let users steer reminder cron outbound requests

Decision: reportable.

Attack path:
1. An authenticated user writes or updates their own `web_push_subscriptions` row with an endpoint value they control.
2. The scheduled service-role worker reads subscription rows across users.
3. When the relevant send conditions are met, the worker passes the stored endpoint into `webPush.sendNotification`.
4. The application infrastructure makes an outbound request to the attacker-selected endpoint.

Counterevidence: the scheduled endpoint itself is cron-secret gated, VAPID keys must be configured, and Web Push payload construction constrains the request shape. These reduce severity but do not remove the stored destination-control issue.

Severity: medium.
