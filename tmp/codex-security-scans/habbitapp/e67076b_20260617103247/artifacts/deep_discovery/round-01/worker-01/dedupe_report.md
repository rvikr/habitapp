# Dedupe Report

## Inputs

- Raw candidates: `raw_candidates.jsonl`
- Candidate count before dedupe: 2
- Candidate count after dedupe: 2

## Decisions

### cand-001

Kept as a unique instance. The source/root-control is shared with `cand-002`, but the sink is the regular reminder sender in `supabase/functions/web-push-reminders/index.ts` at line 249. It has distinct trigger conditions: scheduled reminder windows, due habit reminders, and `WEB_PUSH_CRON_SECRET`.

### cand-002

Kept as a unique instance. The source/root-control is shared with `cand-001`, but the sink is the proactive coach sender in `supabase/functions/coach-push/index.ts` at line 350. It has distinct trigger conditions: `coach_push` feature flag, coach-signal eligibility, daily coach-push dedupe, and `COACH_PUSH_CRON_SECRET`.

## Suppressed Near-Duplicates

No candidate was suppressed as a duplicate. The two candidates remain separate because the finding-discovery rules require independently reachable dangerous sink instances to stay addressable even when they share a storage control.
