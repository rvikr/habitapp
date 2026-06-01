# Input Validation, Streak, Sync, and Export Design

Date: 2026-05-31
Status: Implemented

## Context

Lagan already has partial safeguards for habits and completions:

- `components/habit-form.tsx` checks empty names, positive targets, manual reminder times, and reminder days before submit.
- `lib/data/actions.ts` merges similar habits on create, toggles completion by local day, and calls the `log_habit_completion` RPC for incremental logs.
- `supabase/schema.sql` and `supabase/migrations/0003_publish_readiness.sql` define positive target/completion constraints and a unique `(habit_id, completed_on)` completion period.
- `lib/coach/streak.ts` computes daily streaks from completion date keys.
- `lib/utils/privacy.ts` exports profile, habits, completions, sleep entries, and feedback.

The missing piece is a single, testable contract for validation, date behavior, offline reconciliation, and export integrity. This design keeps the implementation incremental and avoids scattering business rules through screens.

## Goals

- Enforce habit input rules consistently in UI and data actions.
- Make schedule, reminder, target, and completion-period validation deterministic and covered by unit tests.
- Define streak behavior around backfilled logs, grace days, DST, and midnight.
- Prevent duplicate check-ins for the same habit period while keeping undo always available.
- Add offline mutation queuing with explicit conflict resolution.
- Make empty states and data export integrity reliable and auditable.

## Non-Goals

- No redesign of the app navigation or visual language.
- No new account model or server-side multi-device locking beyond existing database constraints and explicit conflict semantics.
- No migration away from Supabase or Expo storage.
- No attempt to infer medical safety beyond the existing local habit sanity limits.

## Approach

Use three layers:

1. Pure rule modules for validation, date periods, streaks, queue reconciliation, and export integrity.
2. Thin data-action integration in `lib/data/actions.ts`, `lib/data/habits.ts`, and `lib/utils/privacy.ts`.
3. UI updates that surface rule failures and empty states without duplicating the rules.

This keeps tests mostly in `tests/unit.test.mjs` and avoids needing emulator coverage for core behavior.

## Habit Validation

Create a pure validation module, likely `lib/habits/input-rules.ts`, used by `components/habit-form.tsx` and `lib/data/actions.ts`.

Rules:

- Name is trimmed, non-empty, and capped at 80 characters.
- Duplicate names compare case-insensitively after whitespace normalization.
- Similar-habit merge remains available, but exact duplicate names should be rejected unless the caller explicitly chooses merge/update behavior.
- Target values are optional only for boolean habits. Quantitative habits require a positive finite number.
- Quantitative values are bounded by metric-specific limits already represented in `SANITY_LIMITS`, plus generic maximums for pages, minutes, and custom numeric habits.
- Default log values and manual log values must be positive finite numbers and must not exceed the habit target when a target exists unless the metric explicitly supports cumulative overflow.

Expected tests:

- Empty and whitespace-only names fail.
- Overlong names fail.
- Exact duplicate names fail after trimming and case normalization.
- Quantitative habits without a target fail.
- Zero, negative, `NaN`, `Infinity`, and oversized targets fail.
- Boolean habits may omit target.

## Schedule Validation

Schedules are valid only when they have a coherent active period.

Rules:

- If reminders are disabled, reminder times are ignored and stored as an empty array.
- If reminders are enabled for manual reminders, at least one valid reminder time is required.
- If reminders are enabled for smart interval reminders, either a positive interval/frequency is required or at least one manual override time is required.
- Active days must contain at least one unique day index from `0` to `6`.
- Contradictory schedules are rejected. Examples: reminders enabled with no days, manual strategy with no times, interval strategy with non-positive interval, or invalid day indexes.
- Reminder times normalize to strict `HH:MM` 24-hour values, are de-duplicated, and are sorted.
- Timezone and DST handling relies on calendar-day rules, not fixed 24-hour offsets. Reminder scheduling should store local wall-clock times and let the native notification platform resolve DST transitions.

Expected tests:

- Empty enabled manual schedule fails.
- Empty enabled smart schedule with no interval fails.
- No active days fails.
- Invalid day indexes fail.
- Duplicate reminder times collapse to one normalized time.
- DST transition dates do not create duplicate reminder schedule entries.

## Completion Periods And Undo

Create a pure completion-period helper, likely `lib/data/completion-rules.ts`.

Rules:

- Completion periods are local date keys for daily habits.
- Future completion dates are rejected.
- Backdated completion is allowed within a bounded lookback window of 7 days by default.
- Duplicate completion for the same `(habit_id, completed_on)` is prevented by both client logic and the database unique constraint.
- Incremental quantitative logging updates the existing period value; boolean done toggles create/delete one row.
- Undo is always available for any existing completion period, including periods outside the normal lookback window.
- Public actions should accept an optional date key so tests and future UI can mark a specific day done without relying on the current clock.

Expected tests:

- Same habit and date cannot produce two boolean completions.
- Quantitative logging for the same date merges into one row/value.
- Future dates fail.
- Dates older than the lookback fail for new logs.
- Undo succeeds for an older existing completion.
- Midnight boundary uses the local date before and after `00:00`.

## Streak Logic

Refactor streak calculation into a rule module that understands schedules and grace days while keeping `streakFromDates` as a simple daily wrapper.

Rules:

- Daily streaks count consecutive local date keys ending at the anchor date.
- If today is not complete but yesterday is complete and the current local time is before a configurable grace cutoff, the displayed streak may include yesterday.
- Grace days are display-only unless persisted by a completion. They must not create fake completion rows.
- Scheduled habits count only scheduled days. A Monday/Wednesday/Friday habit can keep a streak across unscheduled days.
- Backfilled completions inside the lookback window should recalculate streaks immediately.
- DST changes and midnight use calendar-day arithmetic, not millisecond differences.

Expected tests:

- Spring-forward and fall-back dates do not drop or double-count streak days.
- A completion at `23:59` belongs to that date and at `00:00` belongs to the next date.
- A missed scheduled day breaks the streak.
- Unscheduled days do not break a scheduled habit streak.
- Grace cutoff preserves yesterday's streak display before cutoff and drops it after cutoff.
- Backfilled completion restores a broken streak when it fills the missing scheduled day.

## Offline Queue And Conflict Resolution

Add a small offline mutation queue, likely `lib/data/offline-queue.ts`, backed by existing platform storage.

Queued mutation types:

- `habit.upsert`
- `habit.archive`
- `completion.set`
- `completion.increment`
- `completion.delete`

Rules:

- Each queued mutation has a stable id, entity key, operation type, payload, `createdAt`, and `clientUpdatedAt`.
- Queue persistence must be append-only until reconciliation succeeds.
- Reconciliation runs FIFO but may compact superseded operations before sending.
- Habit metadata uses last-write-wins based on `clientUpdatedAt`.
- Completion conflicts merge by `(habit_id, completed_on)`.
- For completion conflicts, the newest operation wins between set/delete. Increment operations fold into the current value unless a newer delete exists.
- Failed network attempts remain queued and retry later.
- Permanent validation failures are removed from the queue and surfaced to the user.

Expected tests:

- Queue preserves operations across storage reload.
- Consecutive habit updates compact to the newest update.
- Completion increments for the same period merge cleanly.
- Newer undo/delete wins over older set/increment.
- Newer set wins over older undo/delete.
- Network failure leaves the queue intact.
- Validation failure removes only the invalid operation.

## Empty States

Keep empty states specific to the missing data surface.

Required states:

- First launch/new user: route to onboarding routine builder, as existing logic already starts to do.
- No habits: show routine builder and manual-create actions.
- No completions for a habit: habit detail shows zero state for weekly history and stats.
- No insights: hide insight claims and show neutral "log a few days to see patterns" copy.
- No leaderboard data: preserve existing leaderboard empty copy.
- No sleep data: preserve sleep empty state and ensure it appears for setup/no-data separately.
- No exportable activity data: export still succeeds with empty arrays and an integrity summary.

Expected tests:

- Data helpers return empty arrays/maps instead of `null` for missing habits and completions.
- Export with no rows includes all top-level sections.
- UI-level empty state copy can be validated with targeted source assertions unless a component test setup is added later.

## Data Export Integrity

Extend `exportMyData` to produce a versioned document with deterministic ordering and integrity metadata.

Export shape:

- `schema_version`
- `exported_at`
- `user`
- `profile`
- `habits`
- `completions`
- `sleep_entries`
- `feedback`
- `integrity`

Integrity metadata:

- Counts for each exported collection.
- Duplicate completion-period detector for `(habit_id, completed_on)`.
- Orphan completion detector for completions whose habit is not present in the exported habit list.
- Stable sort keys for each collection.
- Export should fail with a clear error if any Supabase query returns an error.

Expected tests:

- Export includes every section even when empty.
- Counts match array lengths.
- Completions are sorted by `completed_on` descending and then stable id/created timestamp.
- Duplicate completion periods are reported in `integrity`.
- Orphan completions are reported in `integrity`.
- Query errors fail the export instead of returning partial data as success.

## Implementation Phases

1. Add pure validation and completion-period modules with unit tests.
2. Wire validation into habit forms and data actions.
3. Refactor streak logic and add edge-case tests.
4. Add offline queue module and reconciliation tests.
5. Integrate queue into mutation actions.
6. Harden export shape and integrity tests.
7. Fill empty-state gaps with focused UI/source tests.

Each phase should land with passing `npm test`, and shared behavior should be tested before integration changes.

## Acceptance Criteria

- Habit input validation is consistent between UI submit and direct data actions.
- Empty or contradictory schedules are rejected before persistence.
- Quantitative targets and log values reject invalid and unreasonable values.
- Reminder time handling remains valid across timezone and DST scenarios.
- Duplicate period check-ins are prevented, and undo remains available.
- Streak edge cases for lookback, grace days, scheduled days, DST, and midnight are covered by tests.
- Offline mutations reconcile deterministically with documented conflict behavior.
- Empty states exist for all no-data surfaces listed above.
- Data export is versioned, deterministic, and includes integrity metadata.
