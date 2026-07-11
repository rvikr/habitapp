# QA Checklist

Manual test plan to run before each release. Repeat the **core** section on iOS, Android,
and web at minimum. Platform-specific items are flagged.

Mark each item: ✅ pass · ❌ fail · ⏭️ skip · `<note>`

---

## First-run release gate

Run this gate before claiming the first-time-user experience is release-ready.

| Priority | Gate                      | Evidence required                                                                                                                                   |
| -------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Local first-run web smoke | `npm run smoke:first-run` exits 0 while Expo web is running on `localhost:8083`                                                                     |
| P0       | Live email signup         | New user signs up against the target Supabase project, receives the confirmation email, opens the link, and lands in the app                        |
| P0       | Live password recovery    | Confirmed user requests a reset email, opens the reset link, sets a new password, and signs in with it                                              |
| P0       | Live Google sign-in       | New Google account completes OAuth on web, Android, and iOS with the configured Supabase redirect URLs                                              |
| P0       | Android first install     | Fresh install opens to login, completes signup/sign-in, creates the first habit, logs it, survives app restart, and signs out cleanly               |
| P0       | iOS first install         | Fresh install opens to login, completes signup/sign-in, creates the first habit, logs it, survives app restart, and signs out cleanly               |
| P1       | Native notifications      | Android and iOS permission prompts appear from Reminders, a one-minute reminder fires, tapping it opens the app, and disabling reminders cancels it |
| P1       | Production observability  | A test event appears in PostHog and a controlled test crash appears in Sentry for the preview build                                                 |

Current local automation covers the first row only. The remaining rows need real backend
delivery, OAuth provider configuration, or native devices/emulators.

---

## Activation v2 release gate

Run the activation checks with Expo web available at `http://localhost:8083`:

```sh
npm run smoke:first-run
npm run smoke:treatment-quick-start
npm run smoke:treatment-manual
node scripts/first-run/activation-dashboard-smoke.cjs
```

The aggregate smoke must continue after each scenario; a passing early scenario is not
sufficient evidence for the release.

### Cohorts and onboarding

| Check           | Control                                                                                    | Treatment                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Assignment      | Flag disabled, rollout `0`, and users outside the percentage retain the existing interface | Deterministic user bucket is inside the enabled rollout percentage                            |
| Routine         | Existing eight-step flow completes without changed defaults or promotion behavior          | Exactly three required steps: primary goal, daily context, and biggest constraint             |
| Recommendations | Existing review remains compatible                                                         | Three-to-five ordered suggestions, exactly two initially selected, extras collapsed           |
| Personalization | Existing fields remain unchanged                                                           | Fitness, measurements, and baselines stay optional under `Personalize targets`                |
| Saving          | Existing success path remains unchanged                                                    | Partial success reports failed habits and continues; zero saves or lost authentication blocks |
| Manual creation | Existing create and edit forms remain unchanged                                            | Pre-value create shows Basics, a target/reminder summary, and collapsed Advanced options      |

Confirm that treatment onboarding has no Pro upgrade banner, local recommendations render
without waiting for AI, and an AI response never replaces a review after the user edits it.

### Treatment activation stages

Control users keep the full current interface at every milestone. For treatment users, verify:

| Stage       | Server milestone                                  | Visible tabs                      | Dashboard and route checks                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre_value` | `first_habit_logged_at` is null                   | Today, Settings                   | Hide notification, trial, Pro, level, coach, leaderboard, ranks, and duplicate empty-state header actions. Preserve `Build my routine` as primary and `Choose manually` as secondary. Hidden-tab deep links return to Today. |
| `first_log` | First log exists; `activation_engaged_at` is null | Today, Badges, Progress, Settings | Show only the contextual notification offer. Keep competitive and monetization surfaces hidden. Hidden-tab deep links return to Today.                                                                                       |
| `engaged`   | Engagement timestamp exists                       | All tabs                          | Restore the current level, Pro/trial, coach, leaderboard, and ranks experience.                                                                                                                                              |

Also verify that a returning activated account does not relaunch onboarding on a new device and
that direct Pro navigation remains available even while unsolicited promotion is hidden.

### Authentication and first value

- Scroll to the login footer before changing modes. Email remains populated, password and
  confirmation clear, errors/notices clear, password visibility resets, and Email is both in the
  live viewport and focused.
- Rapid taps while email or Google authentication is running produce one submission.
- Confirmation with a session shows only `Continue to app`; confirmation without a session shows
  only `Sign in`; an error shows only `Back to sign in`.
- Boolean and quantity habits both follow Tutorial -> First Step celebration -> optional
  notification offer -> Today. The celebration describes the completed habit or logged amount.
- Skipping the tutorial performs no completion, shows no celebration or notification prompt, and
  leaves the account pre-value.
- The notification prompt appears only when permission is undecided and the user-scoped local
  marker is absent. Declining or dismissing it does not immediately show it again.
- Rapid log taps, retries, offline queue replay, refresh, and reconciliation produce one completion
  increment and one `first_habit_logged` transition.
- While offline, the first positive log advances locally to `first_log`; after reconnection and
  queue replay it reconciles to the server milestone without replaying celebration or analytics.

### Analytics privacy

Inspect development `[track]` output and the PostHog test project for control and treatment:

- Identify authenticated users with the Supabase UUID only; reset identity on sign-out or expiry.
- Every approved activation event includes cohort, bucket, rollout percentage, activation stage,
  and platform. Control and treatment use the same event/property schema.
- `activation_exposed`, `activation_entry`, and the monotonic first-log event occur once per
  appropriate transition, including offline replay.
- Signup and routine errors contain a category only, never raw error text.
- No event or screen path contains email, habit name, habit ID, body measurements, baselines,
  wizard answers, callback codes, or authentication URLs.
- Analytics opt-out prevents queued and future events from being sent.

### Localization and accessibility

Repeat control and treatment onboarding in English and Hindi on iOS, Android, and web. Check every
new label, error, disclosure, celebration, and accessibility description. On physical devices or
simulators verify keyboard focus, hardware/software back navigation, notification permissions,
VoiceOver/TalkBack reading order, 200% text zoom, contrast, and reduced motion. At 200% zoom,
primary actions must remain reachable without clipped content.

### Stable screenshot evidence

Success screenshots must use `scripts/first-run/screenshot-helper.cjs`. Evidence is valid only
after the expected final URL and named target are visible, `document.fonts.ready` resolves, and
the target bounds remain unchanged across animation frames with reduced motion enabled. Immediate
screenshots are acceptable only for failure diagnostics. Store generated proof under ignored
`tmp/` paths and record the matching JSON output where the smoke provides one.

### Database and rollout evidence

- Start the local Supabase stack, reset it from migrations, run
  `supabase test db supabase/tests/database/activation_v2.test.sql` and
  `supabase test db supabase/tests/database/completion_increment_idempotency.test.sql`, then run
  local security and performance advisors before deployment.
- Deploy the migration with `activation_v2` disabled at `0%`, then validate treatment at `100%` in
  staging.
- Run production at `10%` for at least seven days and 50 treatment users, then at `50%` for at
  least seven days and 200 treatment users.
- Move to `100%` only when median authenticated-entry-to-first-log is under three minutes, wizard
  completion exceeds 70%, first-log conversion improves by at least 20% relative to control,
  authentication and routine failure rates increase by no more than one percentage point, and
  there is no P0/P1 issue or material Sentry regression.
- Roll back immediately by disabling `activation_v2`; retain the control flow until the `100%`
  rollout has remained stable for fourteen days.

---

## 1. Authentication

| #    | Test                                                                     | iOS | Android | Web |
| ---- | ------------------------------------------------------------------------ | --- | ------- | --- |
| 1.1  | Open app → see login screen (no session yet)                             |     |         |     |
| 1.2  | Sign up with new email + 8+ char password (uppercase, lowercase, number) |     |         |     |
| 1.3  | Sign up with weak password — shows validation error                      |     |         |     |
| 1.4  | Receive confirmation email and link works                                |     |         |     |
| 1.5  | Sign in with confirmed account → land on Dashboard                       |     |         |     |
| 1.6  | Sign in with wrong password → see error message                          |     |         |     |
| 1.7  | Forgot password → email arrives → reset link works                       |     |         |     |
| 1.8  | Sign out from Settings → return to login screen                          |     |         |     |
| 1.9  | Kill app cold-start → still signed in (token persisted)                  |     |         |     |
| 1.10 | Wait > 1 hr → still works (token auto-refresh)                           |     |         |     |

---

## 2. Habits

| #    | Test                                                                    | iOS | Android | Web |
| ---- | ----------------------------------------------------------------------- | --- | ------- | --- |
| 2.1  | Empty state on Dashboard shows "Add your first habit"                   |     |         |     |
| 2.2  | Tap + → catalog appears, pick "Drink Water" → form prefilled            |     |         |     |
| 2.3  | Save → habit appears on Dashboard                                       |     |         |     |
| 2.4  | Build custom habit (skip catalog) → save → appears                      |     |         |     |
| 2.5  | Tap habit row → detail screen loads with weekly bars                    |     |         |     |
| 2.6  | Pencil icon → edit form prefills → change name → save → name updates    |     |         |     |
| 2.7  | Trash icon → habit disappears from Dashboard (archived)                 |     |         |     |
| 2.8  | Toggle habit done → checkmark fills, confetti, count updates            |     |         |     |
| 2.9  | Toggle again → unchecks correctly                                       |     |         |     |
| 2.10 | Habit with `target` shows FAB → opens log prompt → enters value → saves |     |         |     |
| 2.11 | Streak count increases after toggling on consecutive days               |     |         |     |
| 2.12 | Pull-to-refresh on Dashboard works                                      |     |         |     |

---

## 3. Achievements

| #   | Test                                                  | iOS | Android | Web |
| --- | ----------------------------------------------------- | --- | ------- | --- |
| 3.1 | XP increases by 10 after each completion              |     |         |     |
| 3.2 | Level rolls over at 500 XP                            |     |         |     |
| 3.3 | "First Step" badge fills after first completion       |     |         |     |
| 3.4 | "Habit Builder" badge fills after creating 3 habits   |     |         |     |
| 3.5 | Locked badges show progress bar with current count    |     |         |     |
| 3.6 | Milestones progress bars render at correct percentage |     |         |     |

---

## 4. Settings

| #    | Test                                                                                            | iOS | Android | Web |
| ---- | ----------------------------------------------------------------------------------------------- | --- | ------- | --- |
| 4.1  | Profile card shows avatar, name, email correctly                                                |     |         |     |
| 4.2  | Tap profile card → avatar picker → change style → save → avatar updates everywhere              |     |         |     |
| 4.3  | Theme toggle: light → dark → light, applies immediately                                         |     |         |     |
| 4.4  | Theme persists across app restart                                                               |     |         |     |
| 4.5  | Reminders screen shows habit list with toggle                                                   |     |         |     |
| 4.6  | Toggle reminder on → permission prompt appears                                                  |     |         |     |
| 4.7  | Allow notification → toggle stays on                                                            |     |         |     |
| 4.8  | Security: weak password rejected (< 8 chars / no number / etc.)                                 |     |         |     |
| 4.9  | Security: matching strong password updates successfully                                         |     |         |     |
| 4.10 | Sign out → returns to login screen                                                              |     |         |     |
| 4.11 | Privacy & Data: analytics opt-out persists after restart                                        |     |         |     |
| 4.12 | Privacy & Data: data export opens and contains current user's habits/logs                       |     |         |     |
| 4.13 | Data export contains `schema_version` and integrity counts; duplicate/orphan checks are present |     |         |     |
| 4.14 | Offline edit/archive is queued and replays after reconnect without changing completion totals   |     |         |     |
| 4.15 | Export an account with over 1,000 rows per collection; counts and final rows are complete       |     |         |     |
| 4.16 | Permanently reject one queued edit; warning survives restart and a later edit still syncs       |     |         |     |
| 4.17 | Dismiss the sync warning; it stays hidden and does not claim the rejected change was applied    |     |         |     |
| 4.18 | Privacy & Data: account deletion request records successfully                                   |     |         |     |
| 4.19 | Feedback: submit bug/idea/usability report and verify it appears in Supabase                    |     |         |     |

---

## 5. Notifications (mobile only)

| #   | Test                                                             | iOS | Android |
| --- | ---------------------------------------------------------------- | --- | ------- |
| 5.1 | Permission request appears on first reminder toggle              |     |         |
| 5.2 | Schedule a reminder for 1 minute in the future → fires correctly |     |         |
| 5.3 | Notification body shows habit name                               |     |         |
| 5.4 | Tapping notification opens the app                               |     |         |
| 5.5 | Disabling reminders cancels scheduled notifications              |     |         |

---

## 6. Cross-platform appearance

| #   | Test                                                                         | iOS | Android | Web |
| --- | ---------------------------------------------------------------------------- | --- | ------- | --- |
| 6.1 | Dark mode renders all screens correctly (no white flashes / unreadable text) |     |         |     |
| 6.2 | Light mode renders all screens correctly                                     |     |         |     |
| 6.3 | Safe-area: status bar / notch / Android nav bar respected                    |     |         |     |
| 6.4 | Keyboard doesn't cover input fields (dashboard, login, log prompt)           |     |         |     |
| 6.5 | Web responsive at 360px / 768px / 1280px viewports                           | ⏭️  | ⏭️      |     |
| 6.6 | Plus Jakarta Sans font loads (no fallback to system)                         |     |         |     |
| 6.7 | Material icons all render correctly                                          |     |         |     |
| 6.8 | Confetti fires on completion and clears                                      |     |         |     |

---

## 7. Edge cases

| #   | Test                                                                                 | iOS | Android | Web |
| --- | ------------------------------------------------------------------------------------ | --- | ------- | --- |
| 7.1 | Offline: app shows cached UI, mutations queue or fail gracefully                     |     |         |     |
| 7.2 | Slow network (Chrome DevTools "Slow 3G"): loading indicators show                    | ⏭️  | ⏭️      |     |
| 7.3 | Force a render error in a component → ErrorBoundary fallback appears with retry      |     |         |     |
| 7.4 | Empty habit list → friendly empty state                                              |     |         |     |
| 7.5 | Very long habit name (50+ chars) — UI doesn't break                                  |     |         |     |
| 7.6 | Cold start time < 3s on a mid-range device                                           |     |         |     |
| 7.7 | Memory: navigate around for 5 minutes, no obvious leaks (use Flipper / web devtools) |     |         |     |

---

## 8. Production smoke tests

After running an EAS build (preview profile), install the build on a physical device:

| #   | Test                                                                       | iOS | Android |
| --- | -------------------------------------------------------------------------- | --- | ------- |
| 8.1 | App launches from home screen → splash → dashboard < 5s                    |     |         |
| 8.2 | App icon shows correctly on home screen                                    |     |         |
| 8.3 | Splash screen displays before content renders                              |     |         |
| 8.4 | App name "Lagan" shows under icon                                          |     |         |
| 8.5 | All flows from sections 1–6 still work                                     |     |         |
| 8.6 | Trigger a test crash → it appears in Sentry within 1 minute                |     |         |
| 8.7 | Track a known event → it appears in PostHog dashboard                      |     |         |
| 8.8 | Run `eas update --branch preview` → app picks up update on next cold start |     |         |

---

## 9. Web PWA

| #   | Test                                                                   | Result |
| --- | ---------------------------------------------------------------------- | ------ |
| 9.1 | Open app in Chrome desktop → "Install" prompt available in address bar |        |
| 9.2 | Install as PWA → opens in standalone window                            |        |
| 9.3 | Manifest at `/manifest.webmanifest` returns 200 with correct JSON      |        |
| 9.4 | OG image preview correct when sharing URL                              |        |
| 9.5 | Lighthouse score: PWA ≥ 80, Accessibility ≥ 90, Performance ≥ 70       |        |
| 9.6 | Title and meta description correct in `<head>`                         |        |

---

## 10. Pre-submission

| #    | Test                                                                    | Result |
| ---- | ----------------------------------------------------------------------- | ------ |
| 10.1 | All `REPLACE_WITH_...` placeholders in `eas.json` and `app.json` filled |        |
| 10.2 | Bundle ID + package name unique and registered with stores              |        |
| 10.3 | App icons (1024×1024 + adaptive) added to `assets/`                     |        |
| 10.4 | Privacy policy URL live and linked in store listings                    |        |
| 10.5 | Production Supabase project separated from dev                          |        |
| 10.6 | `.env.production` keys rotated from any leaked dev keys                 |        |
