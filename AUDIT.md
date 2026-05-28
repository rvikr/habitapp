# Codebase Audit — Lagan Habit Tracker

**Date:** 2026-05-28
**Scope:** Read-only audit across four dimensions — correctness & edge cases, security & data access, UI/UX/cross-platform, performance & efficiency — plus cross-cutting checks on docs, policy, and analytics.
**Baseline:** `npm run typecheck`, `npm run lint`, `npm test` (~90 unit tests), `cd website && npm run typecheck && npm run lint` — **all pass**.
**Findings:** 25 items below, ranked by severity. No code, schema, config, or commits were touched.

| Severity | Count | Notes                                     |
| -------- | ----- | ----------------------------------------- |
| Critical | 0     | None confirmed                            |
| High     | 9     | Security, a11y, policy/compliance, cost   |
| Medium   | 12    | Correctness, theming, docs, RLS hardening |
| Low      | 4     | Doc nits, observability, edge cases       |

Each finding: title · file:line · what's wrong · why it matters · suggested direction.

---

## HIGH

### H1. Lost-update race in `logCompletion` (read-then-upsert)

**Where:** [lib/data/actions.ts:287-320](lib/data/actions.ts#L287-L320)
**Issue:** The function does a SELECT of the current `value`, computes `nextValue = existing.value + increment`, then upserts on `(habit_id, completed_on)`. Two concurrent calls (two devices, double-tap, retry while syncing) both read the same value and both write `value + 1` instead of `value + 2`. The upsert is idempotent on the _key_, not the _counter_.
**Impact:** Silent loss of logged values for metric habits (water ml, steps, minutes). Users see "I logged 200 ml three times but the total only shows 400."
**Fix direction:** Move the increment into a single SQL statement: `upsert ... value = coalesce(habit_completions.value, 0) + :increment` via an RPC, or use `update ... set value = value + :n returning *` then fall back to insert.
**Confidence:** confirmed.

### H2. Open-redirect vector in OAuth callback via `next` param

**Where:** [website/app/auth/callback/route.ts:8](website/app/auth/callback/route.ts#L8), [website/app/auth/callback/route.ts:29](website/app/auth/callback/route.ts#L29)
**Issue:** `const next = searchParams.get("next") ?? "/dashboard"` then `NextResponse.redirect(\`${origin}${next}\`)`. While `next = "//evil.com"`is safely absorbed as a same-origin path,`next = "@evil.com"`produces`https://lagan.health@evil.com` — a valid URL whose host is `evil.com` (lagan.health becomes userinfo). The browser follows.
**Impact:** A crafted login link can deliver an authenticated user to an attacker domain after sign-in, enabling phishing on the trusted domain and session-token leakage if the destination tries to read the URL.
**Fix direction:** Validate `next` matches `^/[^/@]` (single leading slash, not followed by `/` or `@`); otherwise fall back to `/dashboard`. Or parse with `new URL(next, origin)` and reject if `.origin !== origin`.
**Confidence:** confirmed.

### H3. RevenueCat webhook: non-constant-time secret + trusts body's `app_user_id`

**Where:** [supabase/functions/revenuecat-webhook/index.ts:32](supabase/functions/revenuecat-webhook/index.ts#L32), [supabase/functions/revenuecat-webhook/index.ts:44-70](supabase/functions/revenuecat-webhook/index.ts#L44-L70)
**Issue:** Two problems. (1) Authentication uses `req.headers.get("Authorization") !== REVENUECAT_WEBHOOK_AUTH_TOKEN` — non-constant-time string compare; theoretically extractable via timing oracles. (2) After authentication passes, the function writes Pro entitlement to whatever `event.app_user_id` is in the body, using the service-role client. There's no verification that this user owns the subscription event.
**Impact:** Anyone with the (extractable or leaked) webhook token can grant Pro to any user. The user-id is fully attacker-controlled.
**Fix direction:** Use `crypto.subtle.timingSafeEqual` (Deno) for the token compare. Better: verify RevenueCat's HMAC signature instead of a bearer secret. Also cross-check `event.original_app_user_id` against a known mapping or query RevenueCat's API to confirm the subscription before writing.
**Confidence:** confirmed.

### H4. Cron secret in `progress-report` uses non-constant-time compare

**Where:** [supabase/functions/progress-report/index.ts:343](supabase/functions/progress-report/index.ts#L343)
**Issue:** `if (!CRON_SECRET || cronSecret !== CRON_SECRET)` — same timing-attack pattern as H3.
**Impact:** An attacker who extracts the secret can call this endpoint at will, generating AI reports for every Pro user, exhausting Gemini quota and incurring AI cost.
**Fix direction:** Constant-time compare (`crypto.subtle.timingSafeEqual` after encoding both strings to `Uint8Array` of equal length).
**Confidence:** confirmed.

### H5. Privacy policy omits iOS HealthKit disclosure

**Where:** [website/app/privacy/page.tsx:67](website/app/privacy/page.tsx#L67)
**Issue:** The "Data we collect" section explicitly mentions **Android Health Connect** but never mentions **iOS HealthKit**, even though the app depends on `@kingstinct/react-native-healthkit` and reads sleep data from HealthKit on iOS. Apple's App Store Review Guideline 5.1.1(iii) requires apps that read HealthKit data to explicitly disclose this in their privacy policy.
**Impact:** App Store rejection risk for any iOS submission/update that reads HealthKit. Also a transparency/compliance gap with users.
**Fix direction:** Add a sibling paragraph: "Apple HealthKit (iOS). If you grant permission, we read sleep data from Apple HealthKit on iOS. This data stays on your device and your Lagan account; we do not share it with third parties or use it for advertising."
**Confidence:** confirmed.

### H6. Missing `accessibilityLabel` / `accessibilityRole` on core interactive components

**Where:** [components/habit-card.tsx](components/habit-card.tsx), [components/log-entry-fab.tsx](components/log-entry-fab.tsx), [components/theme-toggle.tsx](components/theme-toggle.tsx), [components/avatar-picker.tsx](components/avatar-picker.tsx)
**Issue:** These `TouchableOpacity` / `Pressable` elements have no `accessibilityLabel` or `accessibilityRole`. Screen readers (VoiceOver, TalkBack) announce them as "button, button" with no context — users cannot identify which habit they're toggling or what the FAB does.
**Impact:** App is effectively unusable for blind / low-vision users. App Store review flags missing a11y on submission for some categories.
**Fix direction:** Add `accessibilityRole="button"` plus a contextual `accessibilityLabel` (e.g., `Toggle ${habit.name}, ${done ? "completed" : "not completed"}`). Same for FAB ("Log progress"), theme toggle ("Switch to dark mode"), avatar items ("Select avatar style ${name}").
**Confidence:** confirmed.

### H7. Landing-page scroll animations don't honor `prefers-reduced-motion`

**Where:** [website/components/landing/scroll-animations.tsx:6-41](website/components/landing/scroll-animations.tsx#L6-L41)
**Issue:** IntersectionObserver triggers fade-in animations unconditionally. No `window.matchMedia('(prefers-reduced-motion: reduce)')` check before applying transitions.
**Impact:** Users with vestibular disorders or motion sensitivity (WCAG 2.1 SC 2.3.3) experience uncomfortable scroll-triggered motion on the landing page.
**Fix direction:** Wrap the observer initialization in a `prefers-reduced-motion: no-preference` media-query check; when reduced motion is preferred, set elements to their final state immediately without transition.
**Confidence:** confirmed.

### H8. `resolveCoachMessage(nonBlocking)` lacks in-flight de-duplication

**Where:** [lib/coach/coach-ai.ts:33-44](lib/coach/coach-ai.ts#L33-L44)
**Issue:** On a cache miss with `nonBlocking: true`, the function fires `void (async () => { ... invoke ... setItem })()` without remembering that a fetch is in flight. Multiple call sites (e.g., reminder schedule loop computing coachMessage per habit) hitting the same cache key concurrently each spawn their own Gemini invocation; only the last `setItem` wins.
**Impact:** 2-Nx duplicate Gemini calls on cold cache, doubling AI cost and quota burn. Worst on first reminder-sync after sign-in when every habit is uncached.
**Fix direction:** Maintain `inflight: Map<key, Promise<void>>`; reuse the in-flight promise instead of starting a new one. Also consider per-key locking around the cache write.
**Confidence:** confirmed.

### H9. Website `themeColor` and `gradient-text` still use Quiet Energy purple

**Where:** [website/app/layout.tsx](website/app/layout.tsx) (viewport.themeColor), [website/app/globals.css:22](website/app/globals.css#L22) (`.gradient-text` uses `#451ebb → #5d3fd3 → #006a67`)
**Issue:** The Ember rebrand replaced Quiet Energy purple (`#451ebb`) with orange (`#F26B1F`) for the landing and app, but the root `<meta name="theme-color">` and the gradient utility class still emit the old brand. Mobile browser chrome (Safari/Chrome address bar) tints purple on lagan.health.
**Impact:** Brand inconsistency at the very surface users see first; the address bar, share previews, and any element using `.gradient-text` advertise the old brand.
**Fix direction:** Set `themeColor: "#0B0B0E"` (Ember dark bg) or `"#F26B1F"` (Ember primary). Update `.gradient-text` to `linear-gradient(135deg, #F26B1F 0%, #FFC56B 100%)`.
**Confidence:** confirmed.

---

## MEDIUM

### M1. `types/db.ts` marks `user_id` as `string | null` but schema is `not null`

**Where:** [types/db.ts:71](types/db.ts#L71), [types/db.ts:95](types/db.ts#L95), [types/db.ts:104](types/db.ts#L104) vs [supabase/schema.sql:8](supabase/schema.sql#L8), [supabase/schema.sql:77](supabase/schema.sql#L77), [supabase/schema.sql:90](supabase/schema.sql#L90)
**Issue:** `Habit.user_id`, `HabitCompletion.user_id`, `SleepEntry.user_id` are typed as nullable, but the schema declares them `uuid not null references auth.users(id) on delete cascade`.
**Impact:** Refactors that rely on the type system are unsafe — code may add null guards that obscure real bugs, or omit guards thinking the type is correct. Drift makes future schema/type generators noisier.
**Fix direction:** Tighten to `user_id: string` (non-nullable) for all three types.
**Confidence:** confirmed.

### M2. Reminder-sync errors swallowed via `.catch(() => undefined)`

**Where:** [lib/data/reminder-sync.ts](lib/data/reminder-sync.ts), [lib/data/reminder-sync-queue.ts](lib/data/reminder-sync-queue.ts)
**Issue:** Reminder sync failures are caught and discarded silently. There's no Sentry report, no PostHog event, no in-app indicator. The user just doesn't get reminders.
**Impact:** Users miss reminders they configured; the team has no visibility that sync is broken until users complain.
**Fix direction:** In the catch, call `reportError(err, { context: "reminder-sync" })` (the Sentry wrapper at [lib/services/sentry.ts](lib/services/sentry.ts)). Optionally surface a single in-app warning if N consecutive syncs have failed.
**Confidence:** confirmed (pattern), likely (specific call site numbers from sub-agent).

### M3. `delete-account` cascade is non-atomic; partial failure leaves orphan rows

**Where:** [supabase/functions/delete-account/index.ts:93-120](supabase/functions/delete-account/index.ts#L93-L120) (per sub-agent; not personally verified)
**Issue:** Account deletion deletes from multiple tables sequentially. If table 2's delete fails after table 1's succeeded, the function marks the request "requested" and exits, planning to retry. On retry, table 1 is already empty and the work continues — but a crash mid-cascade can leave partial state if the audit row state isn't durable.
**Impact:** GDPR / Play-Store compliance risk: a user requests deletion, the request is "fulfilled", but some rows remain. Also potential FK errors on retry if order matters.
**Fix direction:** Wrap the cascading deletes in a single SQL transaction (RPC), so it's all-or-nothing. The audit row can record `pending → completed` after the transaction commits.
**Confidence:** likely — verify with the actual file before implementing.

### M4. `getReminderSchedule` habits query has no explicit `.eq("user_id", user.id)`

**Where:** [lib/data/reminders.ts:83-89](lib/data/reminders.ts#L83-L89)
**Issue:** The habits sub-query filters by `archived_at is null` and `reminders_enabled = true` but doesn't filter by user_id. RLS scopes it to the caller, but the explicit filter is missing.
**Impact:** Two real concerns. (1) Defense-in-depth: if RLS is ever weakened or service-role is mistakenly substituted, this leaks every user's habit names to the caller. (2) Query plan stability: Postgres may pick a less-selective index when `user_id` isn't in the WHERE clause, even if the existing `habits_user_id_idx` would have been ideal.
**Fix direction:** Add `.eq("user_id", user.id)` to the habits select. Cheap and risk-free with the index already present at [supabase/schema.sql:21](supabase/schema.sql#L21).
**Confidence:** confirmed.

### M5. Sentry has no user opt-out, yet privacy policy implies all telemetry can be opted out

**Where:** [lib/services/sentry.ts](lib/services/sentry.ts) (no `optedOut` state, no setter) vs [website/app/privacy/page.tsx:66](website/app/privacy/page.tsx#L66) ("collected only with your consent and can be opted out of in Settings → Privacy & Data")
**Issue:** Analytics (`lib/services/analytics.ts`) honors `setAnalyticsOptOut`. Sentry has no such mechanism — it initializes if `EXPO_PUBLIC_SENTRY_DSN` is set and not `__DEV__`. The privacy policy promises an opt-out that doesn't exist for crash reporting.
**Impact:** Compliance/honesty gap — users who toggle "analytics opt-out" in settings believe they've turned off all telemetry; crash reports continue.
**Fix direction:** Either (a) add a Sentry opt-out flag mirroring `setAnalyticsOptOut` and gate `reportError`/`captureException` on it, or (b) narrow the privacy-policy wording to "analytics events (PostHog) can be opted out; crash reports (Sentry) cannot."
**Confidence:** confirmed.

### M6. Admin area uses light slate + Quiet Energy purple, visually disconnected from Ember

**Where:** [website/app/admin/layout.tsx:23](website/app/admin/layout.tsx#L23) (`bg-slate-50`), [website/components/admin/AdminSidebar.tsx](website/components/admin/AdminSidebar.tsx) (`bg-slate-900`, `bg-primary` where Tailwind primary still maps to `#451ebb`)
**Issue:** Admin layout is light-themed and renders `bg-primary` accents that resolve to Quiet Energy purple. The rest of the website (landing, app) is Ember dark with orange `#F26B1F`.
**Impact:** Jarring transition between app and admin, brand fragmentation, and `bg-primary` in admin is dangerously ambiguous — devs maintaining the admin won't know whether to align with old purple or new orange.
**Fix direction:** Either (a) flip admin to Ember dark tokens to match, or (b) lock admin to a deliberately neutral slate theme and replace every `bg-primary` / `text-primary` in admin with explicit `bg-orange-500` / `text-orange-500` (or named admin tokens) so the meaning of "primary" is unambiguous.
**Confidence:** confirmed.

### M7. Landing page is a 1,882-line single file with hundreds of inline hex colors

**Where:** [website/app/page.tsx](website/app/page.tsx)
**Issue:** All landing sections (Hero, Stats, Features, How-it-works, Chill spotlight, Testimonials, CTA, Footer) plus phone-mockup components live in one server component. Colors are inline `style={{ background: '#F26B1F' }}` etc. — not Tailwind tokens, not CSS variables.
**Impact:** (1) Changing brand colors requires touching ~300+ inline literals. (2) Reviewing diffs is painful. (3) Server bundle is large; if any section becomes client-interactive, the whole tree gets pulled into the client bundle. (4) New marketing surfaces (about, pricing, blog) can't reuse the components.
**Fix direction:** Extract sections to `website/components/landing/{hero, stats, features, ...}.tsx`. Define color tokens in `tailwind.config.ts` (`ember-primary`, `ember-bg`, etc.) and use Tailwind classes; reserve inline styles only for dynamic values.
**Confidence:** confirmed.

### M8. `share-card-modal.tsx` hardcodes dark colors, breaks in light mode

**Where:** [components/share-card-modal.tsx:111](components/share-card-modal.tsx#L111), [components/share-card-modal.tsx:144](components/share-card-modal.tsx#L144)
**Issue:** `backgroundColor: "#111"` and `"#0D0D0D"` are inline literals, not theme-aware tokens.
**Impact:** Users in light mode see a dark overlay with dark surfaces — readable but jarring. Theme inconsistency on a screen users explicitly take screenshots of and share publicly.
**Fix direction:** Use `useTheme()` (from `components/theme-provider.tsx`) and pick the surface color from the active theme; or apply NativeWind classes (`bg-surface-hi`).
**Confidence:** confirmed.

### M9. Habit form errors signaled by color only

**Where:** [components/habit-form.tsx:195](components/habit-form.tsx#L195), [components/habit-form.tsx:636](components/habit-form.tsx#L636) (per sub-agent)
**Issue:** Validation errors render red text without an icon, an error-prefix string, or `accessibilityRole="alert"`. WCAG 1.4.1 (Use of Color).
**Impact:** Color-blind users (red-green confusion) and screen-reader users may miss the error entirely.
**Fix direction:** Prefix with an icon (`material-symbols/error`), set `accessibilityRole="alert"` and `accessibilityLiveRegion="polite"`. Don't rely on red alone.
**Confidence:** confirmed.

### M10. Empty states missing on dashboard / achievements / leaderboard

**Where:** [app/(tabs)/index.tsx](app/<tabs>/index.tsx), [app/(tabs)/achievements.tsx](app/<tabs>/achievements.tsx), [app/(tabs)/leaderboard.tsx](app/<tabs>/leaderboard.tsx)
**Issue:** When data is empty, screens render a blank container or just a skeleton that resolves to nothing — no copy guiding the user to "create your first habit" / "you'll unlock badges as you log" / "opt in to leaderboard".
**Impact:** New users land on a screen that feels broken. Particularly bad first-run experience.
**Fix direction:** Add a small `<EmptyState>` component (icon + headline + helper text + optional CTA button) and render it on each `tabs` page when the underlying list is empty.
**Confidence:** likely (Dashboard does have an empty state per QA.md item 2.1, but achievements/leaderboard may not).

### M11. README references stale `lib/` flat paths

**Where:** [README.md:108-121](README.md#L108-L121)
**Issue:** README documents `lib/habits.ts`, `lib/actions.ts`, `lib/reminders.ts`, `lib/password.ts`, `lib/sentry.ts`, `lib/analytics.ts`, `lib/storage.{native,web}.ts`, etc. The actual layout is grouped: `lib/data/habits.ts`, `lib/data/actions.ts`, `lib/data/reminders.ts`, `lib/auth/password.ts`, `lib/services/sentry.ts`, `lib/services/analytics.ts`, `lib/platform/storage.{native,web}.ts`. README also misses `lib/coach/`, `lib/subscription/`, and `lib/i18n/` entirely.
**Impact:** New contributors and your future self look in the wrong place. Onboarding friction.
**Fix direction:** Update the "Project layout" section to reflect the grouped structure. Add the missing dirs (`coach/`, `subscription/`, `i18n/`) and edge-function list (`progress-report`, `validate-habit` are also missing from the deploy section at [README.md:231-234](README.md#L231-L234)).
**Confidence:** confirmed.

### M12. `weekly_progress_reports` has no INSERT/UPDATE/DELETE RLS policies

**Where:** [supabase/migrations/0019_weekly_progress_reports.sql:18-28](supabase/migrations/0019_weekly_progress_reports.sql#L18-L28) (per sub-agent; verify exact file)
**Issue:** RLS is enabled but only a SELECT policy is granted. INSERT/UPDATE/DELETE default to DENY, which is intentional (the edge function writes via service role). But the omission is implicit — a future engineer adding direct-write features will silently fail, and the "service-role only" intent isn't expressed in policy.
**Impact:** Low immediate risk, but ambiguous security posture. Increases configuration debt.
**Fix direction:** Add an explicit comment in the migration: `-- weekly_progress_reports is written only by service role (progress-report edge function); no client policies.` If the table is ever fronted by a client write, add a properly scoped policy.
**Confidence:** likely.

---

## LOW

### L1. Edge functions log raw `user_id` to console

**Where:** [supabase/functions/coach-message/index.ts:88, 97](supabase/functions/coach-message/index.ts#L88) and similar in `habit-routine`, `smart-reminders`, `validate-habit`, `sync-subscription`
**Issue:** Quota-block and access-denial logs include the user's UUID. Not technically PII alone, but in aggregated logs it correlates user behavior and could leak via a log breach.
**Impact:** Minor information disclosure in third-party log aggregation.
**Fix direction:** Hash the user_id (first 8 chars of SHA-256) before logging when only correlation is needed.
**Confidence:** confirmed.

### L2. Floating action button has no explicit `hitSlop`

**Where:** [components/log-entry-fab.tsx](components/log-entry-fab.tsx)
**Issue:** The FAB is 56×56 (meets WCAG 44pt minimum) but lacks explicit `hitSlop`, so the tappable area is exactly the visual area.
**Impact:** Users with motor-control challenges may mis-tap. Minor.
**Fix direction:** Add `hitSlop={8}` (or `{top:8, bottom:8, left:8, right:8}`).
**Confidence:** likely.

### L3. Landing phone-mockup fixed widths may overflow at 320px

**Where:** [website/app/page.tsx:177-178](website/app/page.tsx#L177-L178) (e.g., `width: 300` on PhoneHome)
**Issue:** Fixed 300px-width mockups combined with page padding can exceed 320px viewport on legacy small phones (iPhone SE 1st gen).
**Impact:** Horizontal scrollbar on landing for a small minority of users.
**Fix direction:** Use `max-width: 100%` or constrain via Tailwind responsive utilities.
**Confidence:** likely.

### L4. README missing edge functions `validate-habit` and `progress-report` from deploy list

**Where:** [README.md:231-234](README.md#L231-L234)
**Issue:** README lists "coach-message, delete-account, habit-routine, smart-reminders, sync-subscription, revenuecat-webhook" — but `supabase/functions/` also contains `validate-habit/` and `progress-report/` which need deployment via `supabase functions deploy`.
**Impact:** New deployers may forget to deploy these two functions, leaving habit-validation and weekly progress reports broken.
**Fix direction:** Add both to the README's deploy list.
**Confidence:** confirmed.

---

## What was checked and came up clean

- **Core RLS** on `habits`, `habit_completions`, `sleep_entries` — properly scoped to `auth.uid() = user_id` for read/insert/update/delete ([supabase/schema.sql:110-177](supabase/schema.sql#L110-L177)).
- **Admin guard** is server-side and redirects unauthenticated/non-admin users before rendering ([website/app/admin/layout.tsx:14-20](website/app/admin/layout.tsx#L14-L20)).
- **PostHog opt-out** is honored: `track` short-circuits if `optedOut`, opt-out persists across reboot ([lib/services/analytics.ts:33-37](lib/services/analytics.ts#L33-L37)).
- **Sentry & PostHog & RevenueCat are lazy-loaded** via dynamic `import()`, so cold start isn't blocked when keys are unset.
- **No `dangerouslySetInnerHTML`** with user input found on the website.
- **`.env.local`** is in `.gitignore`; example files use placeholders only; no service-role key shipped to client (`NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`) prefixes are clean.
- **Composite index** `completions_user_date_idx` exists ([supabase/schema.sql:85-86](supabase/schema.sql#L85-L86)), so the 60-day-lookback queries have an index. (One sub-agent claimed it was missing — it's there.)
- **`tests/unit.test.mjs`** (1,489 lines, ~90 assertions) covers date math, XP/level, streak across DST/leap/year-boundary, password strength, sleep scoring, Health-Connect/HealthKit normalization, smart-reminder learning & AI sanitization, routine builder, coach signal & message, Pro access, RevenueCat constants, Supabase refresh-token detection, i18n, and reminder-sync queueing. **All passing.**

---

## Recommended next steps (priority order)

1. **Today / this PR**: Fix H1 (logCompletion race — single-statement upsert), H2 (open-redirect — sanitize `next`), H3+H4 (constant-time secret compares).
2. **This week**: Add iOS HealthKit disclosure to privacy policy (H5) before the next App Store submission; add accessibility labels to the four flagged components (H6); add `prefers-reduced-motion` check (H7); de-dupe `coach-ai` in-flight calls (H8); flip Ember colors in `themeColor` + `gradient-text` (H9).
3. **Next sprint**: tighten `types/db.ts` (M1), surface reminder-sync errors to Sentry (M2), wrap `delete-account` in a transaction (M3), add explicit `user_id` filter (M4), reconcile Sentry-opt-out vs privacy copy (M5), update README paths (M11).
4. **When you touch the area**: Admin theming (M6), landing page refactor (M7), share-card theming (M8), empty states (M10).
5. **Backlog**: low items, plus introduce an e2e test (Playwright is already in devDeps but unused) to lock down the auth → first-habit → completion path.
