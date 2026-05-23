# QA Checklist

Manual test plan to run before each release. Repeat the **core** section on iOS, Android,
and web at minimum. Platform-specific items are flagged.

Mark each item: ✅ pass · ❌ fail · ⏭️ skip · `<note>`

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

| #    | Test                                                                               | iOS | Android | Web |
| ---- | ---------------------------------------------------------------------------------- | --- | ------- | --- |
| 4.1  | Profile card shows avatar, name, email correctly                                   |     |         |     |
| 4.2  | Tap profile card → avatar picker → change style → save → avatar updates everywhere |     |         |     |
| 4.3  | Theme toggle: light → dark → light, applies immediately                            |     |         |     |
| 4.4  | Theme persists across app restart                                                  |     |         |     |
| 4.5  | Reminders screen shows habit list with toggle                                      |     |         |     |
| 4.6  | Toggle reminder on → permission prompt appears                                     |     |         |     |
| 4.7  | Allow notification → toggle stays on                                               |     |         |     |
| 4.8  | Security: weak password rejected (< 8 chars / no number / etc.)                    |     |         |     |
| 4.9  | Security: matching strong password updates successfully                            |     |         |     |
| 4.10 | Sign out → returns to login screen                                                 |     |         |     |
| 4.11 | Privacy & Data: analytics opt-out persists after restart                           |     |         |     |
| 4.12 | Privacy & Data: data export opens and contains current user's habits/logs          |     |         |     |
| 4.13 | Privacy & Data: account deletion request records successfully                      |     |         |     |
| 4.14 | Feedback: submit bug/idea/usability report and verify it appears in Supabase       |     |         |     |

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
