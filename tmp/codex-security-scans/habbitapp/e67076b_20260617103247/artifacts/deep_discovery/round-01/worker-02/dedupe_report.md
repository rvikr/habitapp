# Dedupe Report

## Inputs

- Raw candidate source: `raw_candidates.jsonl`
- Raw candidate count: 2

## Decisions

### HABB-W02-001

Kept as an independent candidate.

- Family: SSRF / callback abuse.
- Instance key: `ssrf:supabase/functions/web-push-reminders/index.ts:249`
- Root source/control: authenticated writes to `public.web_push_subscriptions.endpoint`.
- Sink: `webPush.sendNotification` in `supabase/functions/web-push-reminders/index.ts`.

### HABB-W02-002

Kept as an independent candidate.

- Family: SSRF / callback abuse.
- Instance key: `ssrf:supabase/functions/coach-push/index.ts:350`
- Root source/control: authenticated writes to `public.web_push_subscriptions.endpoint`.
- Sink: `webPush.sendNotification` in `supabase/functions/coach-push/index.ts`.

## Cross-File Dedupe Rationale

The two candidates share the same persisted endpoint source table, but they are not cosmetic duplicates. They have separate scheduled functions, separate cron secrets, separate eligibility logic, and separate send sinks. The `coach-push` candidate also has a feature-flag precondition, while `web-push-reminders` is tied to due reminder windows. Later validation should test the same destination-control question for both but preserve both instances unless runtime/deployment evidence proves one sink is not reachable.
