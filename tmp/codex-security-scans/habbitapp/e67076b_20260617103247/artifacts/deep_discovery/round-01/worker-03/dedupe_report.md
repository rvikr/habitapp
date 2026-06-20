# Dedupe Report: worker-03

## Scope

Raw candidate input: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\raw_candidates.jsonl`

Deduped candidate output: `C:\Users\rk\habbitapp\tmp\codex-security-scans\habbitapp\e67076b_20260617103247\artifacts\deep_discovery\round-01\worker-03\deduped_candidates.jsonl`

## Summary

- Raw candidates: 1
- Deduped candidates: 1
- Dropped as duplicates: 0

## Candidate Groups

### CS-W03-001

Raw members: `CS-W03-001`

Disposition: preserved as a distinct candidate.

Reason: this is a single root cause involving profile entitlement column write authorization. It is not a cosmetic variant of admin route authorization, Edge Function authentication, subscription webhook spoofing, or client-only entitlement display.

## Notes For Central Merge

This candidate should be semantically merged with any other worker output about authenticated users self-updating `profiles.is_pro`, `profiles.revenuecat_entitlement_active`, trial, or expiry fields through Supabase grants/RLS. It should remain separate from findings about admin page exposure, webhook spoofing, or general missing payment verification because the concrete closest control is database column-level write permission.
