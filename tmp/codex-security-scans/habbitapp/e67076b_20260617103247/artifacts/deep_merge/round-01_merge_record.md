# Round 01 Merge Record

Terminal note: the user instructed not to rerun completed discovery agents; this scan proceeds from the six preserved worker artifact sets.

## DSS-001 - Stored web-push endpoints let users steer reminder cron outbound requests

Absorbed worker candidates: worker-01:cand-001, worker-02:HABB-W02-001, worker-04:CAND-W04-001, worker-05:CAND-W05-001
Merge decision: equivalent underlying source/control/sink instance across workers; remediation by constraining stored web-push endpoints and verifying browser push provenance remediates all absorbed observations for this scheduled sender.

## DSS-002 - Stored web-push endpoints let users steer coach-push outbound requests

Absorbed worker candidates: worker-01:cand-002, worker-02:HABB-W02-002, worker-04:CAND-W04-002, worker-05:CAND-W05-002
Merge decision: equivalent underlying source/control/sink instance across workers; remediation by constraining stored web-push endpoints and verifying browser push provenance remediates all absorbed observations for this scheduled sender.

## Reviewed but not promoted

- Profile entitlement self-update: rejected for current migration set because 20260614120000_restrict_profiles_entitlement_writes.sql revokes authenticated table-wide writes and grants only safe columns.
- Support email unbounded body/rate: low-impact authenticated resource abuse; escaped HTML and auth requirement keep it below reportable security threshold, but server-side limits are recommended hardening.
- Habit routine unbounded answers: Pro-only and AI quota guarded; preserve as hardening, not final security finding.
- Admin email allowlist without explicit verified-email check: needs deployment-policy follow-up; Supabase email-confirmation settings are not established by repository evidence.
- Public OG card unbounded query text: public resource-abuse hardening, but fixed image dimensions and constrained copy helpers keep it below reportable threshold.
- Standalone get_leaderboard.sql: deployment hazard only; ordered migrations 0012, 0013, 0021, 0022, and 0023 add auth checks/revoke broader execution.
