# Worker Finding Discovery Report

Worker: `worker-06`
Round: `round-01`
Target: repository-wide scan of `C:\Users\rk\habbitapp`
Threat model source: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-06\threat_model.md`

## Inputs Consumed

- Parent authoritative `rank_input.csv`: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\rank_input.csv`
- Parent exhaustive `deep_review_input.csv`: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\02_discovery\deep_review_input.csv`

Both supplied worklists were consumed as-is. This worker did not regenerate, rerank, overwrite, or reinterpret them.

## Candidate Findings

### WD-001: Documented standalone leaderboard SQL recreates a SECURITY DEFINER aggregate RPC callable through the default PUBLIC execute grant

Instance key: `security-definer-leaderboard:supabase/get_leaderboard.sql:5`

Affected locations:

- `entrypoint/wrapper`: `README.md`, lines `226-230`
  - Backend setup docs list `supabase/get_leaderboard.sql` as a deployment/setup artifact after schema and migrations.
- `root_control`: `supabase/get_leaderboard.sql`, lines `5-16`
  - Creates `get_leaderboard(period text default 'all')` as `SECURITY DEFINER` with `set search_path = public` and no fail-closed `auth.uid()` check.
- `sink`: `supabase/get_leaderboard.sql`, lines `29-71`
  - Reads cross-user `habit_completions` and `profiles` aggregates and returns user ids, display names, XP, and streaks.
- `closest_control`: `supabase/get_leaderboard.sql`, lines `75-76`
  - Adds an authenticated execute grant but does not revoke PostgreSQL's default PUBLIC function execute grant.
- `counterexample_control`: `supabase/migrations/0012_restrict_leaderboard_rpc.sql`, lines `1-5,24-26,80-82`
  - Later migration documents and fixes the same control gap by revoking PUBLIC/anon execute and failing when `auth.uid()` is null.

Attacker-controlled source:

An anonymous Supabase REST/RPC caller or unauthenticated client can invoke exposed database functions if an operator runs the documented standalone SQL artifact.

Broken control and sink:

The function runs with definer privileges and reads all opted-in users' aggregate completion activity. The only visible grant is `grant execute ... to authenticated`, but that does not remove the default PUBLIC execute grant. The function also does not check for a non-null authenticated user before returning data.

Impact:

Anonymous or unintended callers can retrieve opted-in users' user ids, display names, XP, and streak/activity aggregates. This bypasses the intended authenticated/service-only leaderboard boundary established by later migrations and the current `leaderboard` Edge Function path.

Why plausible from code:

The repository simultaneously contains:

- A README backend setup step that names `supabase/get_leaderboard.sql`.
- The standalone SQL file that recreates an older insecure SECURITY DEFINER function.
- A later migration explicitly documenting that the old pattern was unsafe because PostgreSQL grants function EXECUTE to PUBLIC by default.
- Newer service-only leaderboard RPCs and Edge Function code that indicate the intended boundary is no longer direct public/authenticated table or RPC access.

Closest apparent control:

`grant execute on function get_leaderboard(text) to authenticated` is incomplete because it does not revoke PUBLIC execute. Current safer migrations are strong counterevidence for the normal primary deployment path, but the documented standalone file can overwrite that state if run later.

Candidate-local validation evidence:

Static validation support only. The SQL proof tuple is direct: vulnerable source/setup artifact, missing PUBLIC revoke and auth-null guard, SECURITY DEFINER aggregate sink, and later repository fix documenting the same issue. No live Supabase instance was exercised in this discovery-only pass.

Candidate-local attack-path facts:

- Service/component: Supabase Postgres RPC exposed through PostgREST.
- Exposure: documented backend setup artifact, reachable if applied to the deployed Supabase project.
- Auth scope: anonymous or broader-than-intended because default PUBLIC execute remains.
- Cross-boundary behavior: unauthenticated caller can run a definer-rights aggregate over other users' completion data.
- Counterevidence: the current app uses the `leaderboard` Edge Function and service-only RPCs; this does not defeat the stale standalone setup artifact if an operator follows README line `230`.
- Preconditions: operator applies `supabase/get_leaderboard.sql` to the production project after the restrictive migrations or in a project where the restrictive migration is absent.

Validation recommended: yes.

Taxonomy: CWE-862, CWE-668, CWE-200.

Discovery confidence: medium.

## Suppressed / Closed High-Impact Rows

- Public no-JWT Edge Functions: secondary controls were found before service-role impact.
- Authenticated Edge Functions: verified Supabase JWTs or cron secrets bind operations to the expected actor.
- Next admin actions: reviewed server actions call `requireAdmin()` before service-role mutations.
- Profile entitlement writes: current migration revokes broad profile writes and grants only safe columns to authenticated users.
- Auth redirects: web and app paths constrain redirects to same-origin/local paths.
- Rendering/static routes: no deployed script/HTML injection sink was found.
- Secrets/config: repo-stored public keys are client-intended; service secrets are referenced as server-side env or managed secrets.
- Worktrees/generated/docs/promo artifacts: not applicable unless independently deployed.

## Artifact Index

- Threat model: `threat_model.md`
- Seed research: `seed_research.md`
- Work ledger: `work_ledger.jsonl`
- Raw candidates: `raw_candidates.jsonl`
- Dedupe report: `dedupe_report.md`
- Deduped candidates: `deduped_candidates.jsonl`
- Coverage ledger: `repository_coverage_ledger.md`
- Candidate ledger: `findings/WD-001/candidate_ledger.jsonl`
