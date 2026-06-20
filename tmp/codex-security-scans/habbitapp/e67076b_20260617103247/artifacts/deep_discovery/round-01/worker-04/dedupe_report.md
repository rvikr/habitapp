# Dedupe Report

Five raw candidates were emitted by worker-04. Cross-file dedupe preserved all five because each has a distinct proof tuple or independently reachable sink/control:

- CAND-W04-001: stored push endpoint to `web-push-reminders` network sink.
- CAND-W04-002: stored push endpoint to `coach-push` network sink.
- CAND-W04-003: direct feedback email invocation to Resend send sink.
- CAND-W04-004: unbounded `answers` object to Gemini habit-routine sink.
- CAND-W04-005: unbounded web-push subscription cardinality to scheduled fanout loops.

CAND-W04-001 and CAND-W04-002 share the `web_push_subscriptions.endpoint` source and RLS root control, but they remain separate because two scheduled service-role workers independently select and send to that endpoint. CAND-W04-005 also shares the table but covers a separate missing quantity/cardinality control rather than endpoint destination validation.

No raw candidate was dropped as a duplicate.
