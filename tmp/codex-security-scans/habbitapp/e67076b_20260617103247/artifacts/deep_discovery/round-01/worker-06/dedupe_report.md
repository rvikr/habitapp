# Worker Dedupe Report

## Inputs

- Raw candidates: `raw_candidates.jsonl`
- Worker: `round-01/worker-06`
- Parent authoritative worklists consumed without regeneration:
  - `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\rank_input.csv`
  - `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\deep_review_input.csv`

## Dedupe Decisions

### WD-001

Kept as a standalone candidate.

Reason: the root cause is specific to the documented standalone `supabase/get_leaderboard.sql` setup artifact. It is related to earlier leaderboard hardening migrations, but it is independently reachable if an operator follows the README and runs the stale standalone SQL after the restrictive migrations. No other raw candidate in this worker had the same source, broken control, sink, and deployment/setup effect tuple.

## Suppressed Same-Family Rows

- Current primary leaderboard Edge Function and service-only RPCs were not merged into WD-001 because they are counterevidence for the normal runtime path, not the vulnerable standalone setup artifact.
- `.worktrees/**` copies of older leaderboard/profile code were not merged because they are local worktree copies without deployment evidence.
