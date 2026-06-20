from __future__ import annotations

import html
import json
from pathlib import Path


scan = Path(r"C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247")
art = scan / "artifacts"
context = art / "01_context"
disc = art / "02_discovery"
cov = art / "03_coverage"
rec = art / "04_reconciliation"
finds = art / "05_findings"
merge = art / "deep_merge"
rounddir = art / "deep_discovery" / "round-01"

for directory in [context, disc, cov, rec, finds, merge]:
    directory.mkdir(parents=True, exist_ok=True)

threat = """# Overview

Lagan is a habit-tracking application with an Expo/React Native client, a Next.js website/admin surface, Supabase database migrations, and Supabase Edge Functions. The security-relevant runtime surfaces are authenticated mobile/web users, public website routes, scheduled Edge Functions that run with service-role credentials, admin-only Next.js server actions, and database RPC/RLS policies.

# Threat Model, Trust Boundaries, and Assumptions

- Authenticated end users are untrusted across user, subscription, habit, feedback, AI quota, and notification boundaries.
- Browser clients and mobile clients can bypass client-side validation and call Supabase tables, RPCs, and Edge Functions directly with their own JWTs.
- Supabase service-role Edge Functions are privileged and must not let user-controlled stored data choose arbitrary privileged network, data, or admin effects.
- Admin actions are high privilege and rely on server-side session checks plus an `ADMIN_EMAILS` allowlist.
- Scheduled functions are not public API surfaces, but they process stored user data and can create delayed cross-boundary effects.
- Operator-only setup scripts and documentation are in scope as deployment hazards when the README presents them as production setup inputs, but later ordered migrations are strong counterevidence when they supersede a standalone script.

# Attack Surface, Mitigations, and Attacker Stories

- Web push subscriptions: authenticated users can create/update their own `web_push_subscriptions` rows; scheduled service-role functions later read those rows and call outbound push delivery APIs.
- AI functions: authenticated Pro users can trigger Gemini-backed functions, with quota guards limiting cost and frequency.
- Support email: authenticated users can invoke a Resend-backed function; HTML output escapes user fields, but email cost/abuse limits rely mostly on client/database flow.
- OG image route: public GET route renders images from query parameters; fixed dimensions and constrained message helpers reduce impact.
- Admin site: server actions call `requireAdmin` and then use a service-role client for privileged mutations.
- Database migrations: RLS and explicit grants are the primary controls for user-owned data and privileged subscription/leaderboard/pro-access fields.

# Severity Calibration (Critical, High, Medium, Low)

- Critical: unauthenticated account takeover, service-role secret disclosure, broad cross-user data modification, or credible remote code execution from an exposed production surface.
- High: authenticated but realistic privilege escalation, meaningful cross-user data exposure, or strong SSRF/file/network impact reaching sensitive internal services.
- Medium: authenticated or delayed service-side request/control abuse with constrained payloads or uncertain internal target impact; bounded resource abuse with clear production cost or availability effect.
- Low: self-only issues, minor metadata exposure, weak abuse paths already constrained by quota/rate limits, or deployment-only hazards with strong checked-in counterevidence.
"""

(context / "threat_model.md").write_text(threat, encoding="utf-8")

candidates = [
    {
        "candidate_id": "DSS-001",
        "title": "Stored web-push endpoints let users steer reminder cron outbound requests",
        "severity": "medium",
        "confidence": "medium",
        "category": "SSRF / server-side callback abuse",
        "cwe": ["CWE-918"],
        "instance_key": "ssrf:supabase/functions/web-push-reminders/index.ts:249",
        "affected_locations": [
            {
                "label": "root_control",
                "path": "supabase/migrations/20260605060845_0024_web_push_subscriptions.sql",
                "lines": "15",
                "detail": "endpoint is stored as unconstrained text",
            },
            {
                "label": "root_control",
                "path": "supabase/migrations/20260605060845_0024_web_push_subscriptions.sql",
                "lines": "43-46",
                "detail": "authenticated users can manage their own subscription rows",
            },
            {
                "label": "entrypoint/wrapper",
                "path": "supabase/functions/web-push-reminders/index.ts",
                "lines": "135-137",
                "detail": "service-role cron reads stored endpoints",
            },
            {
                "label": "sink",
                "path": "supabase/functions/web-push-reminders/index.ts",
                "lines": "219-249",
                "detail": "stored endpoint is passed to webPush.sendNotification",
            },
        ],
        "absorbed": [
            "worker-01:cand-001",
            "worker-02:HABB-W02-001",
            "worker-04:CAND-W04-001",
            "worker-05:CAND-W05-001",
        ],
    },
    {
        "candidate_id": "DSS-002",
        "title": "Stored web-push endpoints let users steer coach-push outbound requests",
        "severity": "medium",
        "confidence": "medium",
        "category": "SSRF / server-side callback abuse",
        "cwe": ["CWE-918"],
        "instance_key": "ssrf:supabase/functions/coach-push/index.ts:350",
        "affected_locations": [
            {
                "label": "root_control",
                "path": "supabase/migrations/20260605060845_0024_web_push_subscriptions.sql",
                "lines": "15",
                "detail": "endpoint is stored as unconstrained text",
            },
            {
                "label": "root_control",
                "path": "supabase/migrations/20260605060845_0024_web_push_subscriptions.sql",
                "lines": "43-46",
                "detail": "authenticated users can manage their own subscription rows",
            },
            {
                "label": "entrypoint/wrapper",
                "path": "supabase/functions/coach-push/index.ts",
                "lines": "226-229",
                "detail": "service-role coach cron reads stored endpoints",
            },
            {
                "label": "sink",
                "path": "supabase/functions/coach-push/index.ts",
                "lines": "347-353",
                "detail": "stored endpoint is passed to webPush.sendNotification",
            },
        ],
        "absorbed": [
            "worker-01:cand-002",
            "worker-02:HABB-W02-002",
            "worker-04:CAND-W04-002",
            "worker-05:CAND-W05-002",
        ],
    },
]

merge_record = [
    "# Round 01 Merge Record",
    "",
    "Terminal note: the user instructed not to rerun completed discovery agents; this scan proceeds from the six preserved worker artifact sets.",
    "",
]
for candidate in candidates:
    merge_record.extend(
        [
            f"## {candidate['candidate_id']} - {candidate['title']}",
            "Absorbed worker candidates: " + ", ".join(candidate["absorbed"]),
            "Merge decision: equivalent underlying source/control/sink instance across workers; remediation by constraining stored web-push endpoints and verifying browser push provenance remediates all absorbed observations for this scheduled sender.",
            "",
        ]
    )

reviewed_not_promoted = [
    "Profile entitlement self-update: rejected for current migration set because 20260614120000_restrict_profiles_entitlement_writes.sql revokes authenticated table-wide writes and grants only safe columns.",
    "Support email unbounded body/rate: low-impact authenticated resource abuse; escaped HTML and auth requirement keep it below reportable security threshold, but server-side limits are recommended hardening.",
    "Habit routine unbounded answers: Pro-only and AI quota guarded; preserve as hardening, not final security finding.",
    "Admin email allowlist without explicit verified-email check: needs deployment-policy follow-up; Supabase email-confirmation settings are not established by repository evidence.",
    "Public OG card unbounded query text: public resource-abuse hardening, but fixed image dimensions and constrained copy helpers keep it below reportable threshold.",
    "Standalone get_leaderboard.sql: deployment hazard only; ordered migrations 0012, 0013, 0021, 0022, and 0023 add auth checks/revoke broader execution.",
]
merge_record.append("## Reviewed but not promoted")
merge_record.extend(f"- {item}" for item in reviewed_not_promoted)
(merge / "round-01_merge_record.md").write_text("\n".join(merge_record) + "\n", encoding="utf-8")

inventory = [
    "# Canonical Candidate Inventory",
    "",
    "Terminal state: capped by user instruction not to rerun completed discovery agents; centralized validation uses the preserved completed worker outputs.",
    "",
]
for candidate in candidates:
    inventory.extend(
        [
            f"## {candidate['candidate_id']} - {candidate['title']}",
            f"Severity hypothesis: {candidate['severity']}",
            f"Confidence: {candidate['confidence']}",
            "Affected locations:",
        ]
    )
    for location in candidate["affected_locations"]:
        inventory.append(f"- {location['label']}: {location['path']}:{location['lines']} - {location.get('detail', '')}")
    inventory.append("")
(merge / "round-01_candidate_inventory.md").write_text("\n".join(inventory), encoding="utf-8")
(merge / "canonical_candidate_inventory.md").write_text("\n".join(inventory), encoding="utf-8")

with (rec / "deduped_candidates.jsonl").open("w", encoding="utf-8") as deduped, (
    disc / "raw_candidates.jsonl"
).open("w", encoding="utf-8") as raw:
    for candidate in candidates:
        obj = {k: v for k, v in candidate.items() if k != "absorbed"}
        obj["absorbed_worker_candidates"] = candidate["absorbed"]
        deduped.write(json.dumps(obj, ensure_ascii=False) + "\n")
        raw.write(json.dumps(obj, ensure_ascii=False) + "\n")
(rec / "dedupe_report.md").write_text("\n".join(merge_record) + "\n", encoding="utf-8")

discovery_report = ["# Finding Discovery Report", "", "Canonical merged candidates passed to validation:", ""]
for candidate in candidates:
    discovery_report.extend(
        [
            f"## {candidate['candidate_id']}: {candidate['title']}",
            f"Instance key: {candidate['instance_key']}",
            "Affected locations:",
        ]
    )
    for location in candidate["affected_locations"]:
        discovery_report.append(f"- {location['label']}: {location['path']}:{location['lines']} - {location.get('detail', '')}")
    discovery_report.extend(
        [
            "Attacker-controlled source: authenticated user-controlled `web_push_subscriptions.endpoint` stored through owner RLS.",
            "Broken control: no endpoint scheme/host/provenance constraint before service-role scheduled sender consumes the row.",
            "Sink: `webPush.sendNotification`.",
            "Impact: delayed server-side outbound request/callback abuse from privileged scheduled infrastructure; payload and method are constrained by Web Push library behavior.",
            "Validation recommended: yes.",
            "",
        ]
    )
(disc / "finding_discovery_report.md").write_text("\n".join(discovery_report), encoding="utf-8")

with (disc / "work_ledger.jsonl").open("w", encoding="utf-8") as output:
    for path in sorted(rounddir.glob("worker-*/work_ledger.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
                obj.setdefault("worker", path.parent.name)
            except Exception:
                obj = {"worker": path.parent.name, "raw": line}
            output.write(json.dumps(obj, ensure_ascii=False) + "\n")

seed_parts = []
for path in sorted(rounddir.glob("worker-*/seed_research.md")):
    if path.exists():
        seed_parts.extend([f"# {path.parent.name}", path.read_text(encoding="utf-8")])
(context / "seed_research.md").write_text("\n\n".join(seed_parts) if seed_parts else "No advisory seed identifiers were supplied.\n", encoding="utf-8")

coverage = """# Repository Coverage Ledger

| Row | Surface | Risk Area | Files checked | Disposition | Evidence summary |
| --- | --- | --- | --- | --- | --- |
| COV-001 | Web push reminder scheduled function | SSRF/callback abuse | web_push_subscriptions migration; web-push-reminders edge function | reportable | Authenticated users can write unconstrained endpoints; service-role cron sends to them. |
| COV-002 | Coach push scheduled function | SSRF/callback abuse | web_push_subscriptions migration; coach-push edge function | reportable | Same stored endpoint root control reaches an independent scheduled sender. |
| COV-003 | Profiles entitlement columns | Authz / privilege escalation | admin_schema.sql; 0002/0018 migrations; 20260614120000 hardening | rejected | Later migration revokes authenticated table-wide writes and grants only safe profile columns. |
| COV-004 | Support email function | Email/cost abuse | support-email edge function; feedback client validation | rejected | Function is authenticated and escapes HTML; missing server-side length/rate checks are hardening but impact is low. |
| COV-005 | Habit routine AI endpoint | AI resource abuse | habit-routine edge function; ai-guard | rejected | Endpoint requires Pro access and enforces hourly/daily AI quota before Gemini call. |
| COV-006 | Admin allowlist | Admin authorization | requireAdmin, admin layout/actions | Needs follow-up | Repository checks email allowlist but not verified-email state; exploitability depends on Supabase auth email-confirmation deployment policy. |
| COV-007 | OG card route | Public image-render DoS | website API route; share-message helpers | rejected | Public rendering is unauthenticated, but output dimensions and copy helpers constrain impact; add input/rate limits as hardening. |
| COV-008 | Standalone leaderboard SQL | Deployment-order auth bypass | get_leaderboard.sql; ordered restrictive migrations; README | Needs follow-up | Standalone script can recreate weaker grants if manually reapplied after migrations; current ordered migrations include auth checks and revokes. |
"""
(cov / "repository_coverage_ledger.md").write_text(coverage, encoding="utf-8")

reviewed = """# Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Web push reminders | SSRF/callback abuse | Reported | Stored endpoints reach `webPush.sendNotification` in the reminder cron. |
| Coach push | SSRF/callback abuse | Reported | Same stored endpoint control reaches a separate scheduled sender. |
| Profiles entitlement writes | Authz / privilege escalation | Rejected | Current migration set contains explicit column-level grants that close the self-upgrade path. |
| Support email | Email/cost abuse | Rejected | Authenticated-only and escaped; server-side length/rate limits remain recommended. |
| Habit routine AI | AI resource abuse | Rejected | Pro and quota controls limit cost and reachability. |
| Admin email allowlist | Admin authz | Needs follow-up | Confirm deployed Supabase settings require email ownership before session issuance. |
| OG card route | Public render DoS | Rejected | Fixed dimensions and constrained copy keep impact low; input/rate limits are hardening. |
| Standalone leaderboard SQL | Deployment drift | Needs follow-up | Do not reapply standalone SQL after ordered migrations; prefer migrations only. |
"""
(cov / "reviewed_surfaces.md").write_text(reviewed, encoding="utf-8")

for candidate in candidates:
    candidate_dir = finds / candidate["candidate_id"]
    candidate_dir.mkdir(parents=True, exist_ok=True)
    receipts = [
        {
            "phase": "discovery",
            "candidate_id": candidate["candidate_id"],
            "status": "merged",
            "absorbed_worker_candidates": candidate["absorbed"],
            "artifact": "artifacts/deep_merge/canonical_candidate_inventory.md",
        },
        {
            "phase": "validation",
            "candidate_id": candidate["candidate_id"],
            "method": "static code trace against migration and Edge Function source",
            "disposition": "reportable",
            "evidence": "Authenticated owner RLS permits storing endpoint text; scheduled service-role function reads endpoint and passes it to webPush.sendNotification; no repository endpoint allowlist/provenance check found.",
        },
        {
            "phase": "attack-path",
            "candidate_id": candidate["candidate_id"],
            "decision": "reportable",
            "severity": candidate["severity"],
            "facts": "Authenticated user can create stored endpoint; cron-secret gated service-role worker later performs outbound Web Push request. Payload and method are constrained, so severity is medium.",
        },
    ]
    with (candidate_dir / "candidate_ledger.jsonl").open("w", encoding="utf-8") as ledger:
        for receipt in receipts:
            ledger.write(json.dumps(receipt, ensure_ascii=False) + "\n")
    validation = f"""# Validation Report: {candidate['title']}

Rubric:
- [x] Attacker-controlled source is present in the checked-in code.
- [x] Source reaches a privileged scheduled worker.
- [x] The worker performs an outbound request using the stored endpoint.
- [ ] Runtime behavior of the external `web-push` package was reproduced locally.
- [x] No repository-level allowlist or endpoint provenance check was found.

Method: static code trace.

Evidence: `{candidate['affected_locations'][0]['path']}` stores `endpoint` as text, owner RLS permits authenticated users to manage their own rows, and `{candidate['affected_locations'][-1]['path']}` passes that value to `webPush.sendNotification`.

Disposition: reportable.

Remaining uncertainty: runtime library behavior may constrain scheme/method/payload; this is reflected in medium confidence and medium severity.
"""
    (candidate_dir / "validation_report.md").write_text(validation, encoding="utf-8")
    attack_path = f"""# Attack Path Analysis: {candidate['title']}

Decision: reportable.

Attack path:
1. An authenticated user writes or updates their own `web_push_subscriptions` row with an endpoint value they control.
2. The scheduled service-role worker reads subscription rows across users.
3. When the relevant send conditions are met, the worker passes the stored endpoint into `webPush.sendNotification`.
4. The application infrastructure makes an outbound request to the attacker-selected endpoint.

Counterevidence: the scheduled endpoint itself is cron-secret gated, VAPID keys must be configured, and Web Push payload construction constrains the request shape. These reduce severity but do not remove the stored destination-control issue.

Severity: medium.
"""
    (candidate_dir / "attack_path_analysis_report.md").write_text(attack_path, encoding="utf-8")

(finds / "validation_summary.md").write_text(
    "# Validation Summary\n\nTwo canonical candidates survived validation as reportable medium-severity SSRF/callback-abuse findings. Other discovered candidates were closed in the reviewed surfaces ledger.\n",
    encoding="utf-8",
)
(finds / "attack_path_analysis_report.md").write_text(
    "# Attack Path Analysis Summary\n\nBoth surviving candidates share the same stored endpoint root control but reach independent scheduled senders and are kept as separate findings.\n",
    encoding="utf-8",
)

report = f"""# Security Review: habbitapp

## Scope

- In scope: repository-wide scan of `C:\\Users\\rk\\habbitapp` at commit `e67076b`.
- Scan mode: Codex Security Deep Security Scan, continued from completed worker discovery artifacts at `{scan}`.
- Context: threat model generated during scan from repository code and worker threat models.
- Validation mode: static source and migration trace; no live Supabase deployment or Web Push runtime harness was available.
- Limitation: after the completed discovery round, the user instructed not to rerun agents, so the centralized tail uses the preserved completed worker data rather than launching additional discovery rounds.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 2 |
| Severity mix | medium: 2 |
| Confidence mix | medium: 2 |
| Coverage | 1,010 source-like worklist rows reviewed by workers; canonical validation focused on merged candidates and high-impact surfaces |
| Validation mode | Static trace against source, migrations, and scheduled function code |
| Final markdown | `{scan / 'report.md'}` |
| Final HTML | `{scan / 'report.html'}` |

## Threat Model

{threat}

## Findings

| # | Finding | Severity | Confidence |
| --- | --- | --- | --- |
| 1 | [Stored web-push endpoints let users steer reminder cron outbound requests](#1-stored-web-push-endpoints-let-users-steer-reminder-cron-outbound-requests) | medium | medium |
| 2 | [Stored web-push endpoints let users steer coach-push outbound requests](#2-stored-web-push-endpoints-let-users-steer-coach-push-outbound-requests) | medium | medium |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct source, configuration, or runtime evidence supports the finding, with no material unresolved reachability or exploitability blocker. |
| medium | Source evidence supports a plausible issue, but runtime behavior, deployment configuration, role reachability, type constraints, or exploit reliability still need proof. |
| low | Weak or incomplete evidence; include only when the user explicitly wants follow-up candidates in the final report. |

### [1] Stored web-push endpoints let users steer reminder cron outbound requests

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | medium |
| Confidence rationale | Static source trace proves stored endpoint control reaches the reminder sender, but exact `web-push` runtime URL constraints were not reproduced locally. |
| Category | SSRF / server-side callback abuse |
| CWE | CWE-918 Server-Side Request Forgery |
| Affected lines | `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:15`, `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46`, `supabase/functions/web-push-reminders/index.ts:135-137`, `supabase/functions/web-push-reminders/index.ts:219-249` |

#### Summary

Authenticated users can manage their own `web_push_subscriptions` rows, and the schema stores `endpoint` as unconstrained text. The reminder cron later runs with service-role credentials, reads every stored subscription, and passes the stored endpoint to `webPush.sendNotification`. There is no repository control that proves the endpoint came from a browser `PushSubscription` or that it belongs to an expected push-service origin.

#### Validation

Method: static code trace. The migration defines the unbounded endpoint column and owner write policy, while `web-push-reminders` selects `endpoint`, builds `pushSub`, and calls `webPush.sendNotification`. No endpoint allowlist, URL parser, scheme/host check, or server-side subscription provenance check was found. Runtime behavior of the external `web-push` library was not reproduced, so confidence remains medium.

#### Dataflow

Authenticated user-controlled row in `web_push_subscriptions.endpoint` -> service-role reminder cron selects subscription rows -> `pushSub.endpoint = sub.endpoint` -> `webPush.sendNotification(pushSub, ...)`.

#### Reachability

A signed-in user can write their own subscription row through the exposed Supabase table policy. The scheduled worker is cron-secret gated, but that only protects direct invocation; it still processes attacker-controlled stored endpoints during normal scheduled delivery when the user has due reminders. The outbound request shape is constrained to Web Push delivery, reducing but not eliminating server-side callback risk.

#### Severity

Medium. The attacker has a realistic authenticated source and can influence a service-side outbound destination, but exploitation is delayed by reminder timing and constrained by Web Push request semantics. Evidence that the runtime can reach internal HTTPS services or cloud metadata would raise severity; proof that `web-push` enforces only real browser push service origins would lower it.

#### Remediation

Validate endpoints server-side before insert/update and before send. Restrict endpoints to known push-service HTTPS origins, reject private/link-local/localhost destinations after DNS/IP normalization, store only subscriptions created through browser PushManager flows, and add tests for malicious endpoints in the scheduled sender. Consider per-user subscription limits and stale endpoint pruning independent of send failures.

### [2] Stored web-push endpoints let users steer coach-push outbound requests

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | medium |
| Confidence rationale | Static source trace proves stored endpoint control reaches the coach-push sender, but exact `web-push` runtime URL constraints were not reproduced locally. |
| Category | SSRF / server-side callback abuse |
| CWE | CWE-918 Server-Side Request Forgery |
| Affected lines | `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:15`, `supabase/migrations/20260605060845_0024_web_push_subscriptions.sql:43-46`, `supabase/functions/coach-push/index.ts:226-229`, `supabase/functions/coach-push/index.ts:347-353` |

#### Summary

The coach-push scheduled function independently consumes the same user-managed subscription endpoint data. When the feature flag and send conditions allow a coach push, the service-role worker groups subscriptions by user and sends to every stored endpoint without validating endpoint destination or provenance.

#### Validation

Method: static code trace. The migration permits authenticated users to manage rows containing arbitrary endpoint text. `coach-push` selects `id, user_id, endpoint, p256dh, auth, timezone, last_seen_at`, groups rows by user, and passes each stored endpoint to `webPush.sendNotification`. No destination validation appears in the function or schema. Runtime behavior of the external `web-push` package was not reproduced, so confidence remains medium.

#### Dataflow

Authenticated user-controlled row in `web_push_subscriptions.endpoint` -> service-role coach-push cron selects subscription rows -> grouped subscriptions retain `sub.endpoint` -> `webPush.sendNotification({{ endpoint: sub.endpoint, ... }}, ...)`.

#### Reachability

A signed-in user can seed the stored endpoint. The coach sender is cron-secret gated and feature-flagged, and delivery depends on eligible coach signals, but those are normal production preconditions for the scheduled workflow rather than counterevidence. The outbound request is constrained to Web Push semantics, which keeps this at medium severity.

#### Severity

Medium. This is an authenticated stored-destination control issue in a privileged scheduled workflow, with constrained payload/method and feature-gated timing. Evidence of reachable internal targets from the Edge Function environment would raise severity; a proven push-service-origin enforcement in `web-push` would lower it.

#### Remediation

Use the same endpoint validation/provenance guard as the reminder sender. Revalidate stored endpoints before sending, constrain origins to known browser push providers, reject private/network-local destinations after canonicalization, and add tests for malicious stored endpoints in `coach-push`. Add per-user subscription caps to limit fanout amplification.

## Reviewed Surfaces

{reviewed}

## Open Questions And Follow Up

- Validate the deployed Web Push runtime with a disposable environment to confirm whether `web-push@3.6.7` rejects non-push-service HTTPS origins before making a network request.
- Confirm Supabase auth settings for the admin website: email confirmation should be required before a session can satisfy `ADMIN_EMAILS`.
- Remove or clearly deprecate `supabase/get_leaderboard.sql` from manual setup docs, or update it to match the latest restrictive migration.
"""

(scan / "report.md").write_text(report, encoding="utf-8")
html_doc = (
    '<!doctype html><html><head><meta charset="utf-8"><title>habbitapp Codex Security Scan</title>'
    "<style>body{font-family:system-ui,Segoe UI,sans-serif;max-width:980px;margin:40px auto;padding:0 24px;line-height:1.5}"
    "code{background:#f3f4f6;padding:2px 4px;border-radius:4px}table{border-collapse:collapse;width:100%;margin:1em 0}"
    "td,th{border:1px solid #ddd;padding:6px;text-align:left}h1,h2,h3{line-height:1.2}</style></head><body><pre style=\"white-space:pre-wrap\">"
    + html.escape(report)
    + "</pre></body></html>"
)
(scan / "report.html").write_text(html_doc, encoding="utf-8")

print(scan)
