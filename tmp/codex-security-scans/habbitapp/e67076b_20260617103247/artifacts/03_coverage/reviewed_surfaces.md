# Reviewed Surfaces

| Surface                     | Risk Area                    | Outcome         | Notes                                                                                         |
| --------------------------- | ---------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| Web push reminders          | SSRF/callback abuse          | Reported        | Stored endpoints reach `webPush.sendNotification` in the reminder cron.                       |
| Coach push                  | SSRF/callback abuse          | Reported        | Same stored endpoint control reaches a separate scheduled sender.                             |
| Profiles entitlement writes | Authz / privilege escalation | Rejected        | Current migration set contains explicit column-level grants that close the self-upgrade path. |
| Support email               | Email/cost abuse             | Rejected        | Authenticated-only and escaped; server-side length/rate limits remain recommended.            |
| Habit routine AI            | AI resource abuse            | Rejected        | Pro and quota controls limit cost and reachability.                                           |
| Admin email allowlist       | Admin authz                  | Needs follow-up | Confirm deployed Supabase settings require email ownership before session issuance.           |
| OG card route               | Public render DoS            | Rejected        | Fixed dimensions and constrained copy keep impact low; input/rate limits are hardening.       |
| Standalone leaderboard SQL  | Deployment drift             | Needs follow-up | Do not reapply standalone SQL after ordered migrations; prefer migrations only.               |
