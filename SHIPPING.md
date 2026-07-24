# Shipping checklist

Everything you need to do (and pay for) before the first app store submission and web
deploy. Items marked **(automatable)** I've already wired into the codebase; items marked
**(you)** require manual setup, accounts, or creative work.

---

## 1. Developer accounts

| Item                        | Who | Cost         | Notes                                                                                                                            |
| --------------------------- | --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Apple Developer Program     | you | $99/yr       | https://developer.apple.com/programs/ — required for App Store. Allow 1–2 days for verification.                                 |
| Google Play Developer       | you | $25 one-time | https://play.google.com/console/signup — required for Play Store.                                                                |
| Expo / EAS account          | you | Free / paid  | https://expo.dev — free tier covers small apps. `npx eas-cli login` after sign-up.                                               |
| Supabase production project | you | Free / paid  | Create a _separate_ project for production (don't reuse dev). Apply `supabase/schema.sql`, then `supabase/migrations/` in order. |
| Sentry                      | you | Free         | https://sentry.io — create a React Native project, copy DSN to `EXPO_PUBLIC_SENTRY_DSN`.                                         |
| PostHog                     | you | Free         | https://posthog.com — copy project key to `EXPO_PUBLIC_POSTHOG_KEY`.                                                             |
| Vercel / Netlify (for web)  | you | Free         | Either works. Free tier handles low traffic.                                                                                     |
| Privacy policy generator    | you | Free         | https://termly.io or https://www.freeprivacypolicy.com. Required by Apple/Google/CCPA.                                           |

---

## 2. Visual assets

The required app/PWA PNGs are present under `assets/` and `public/`. Regenerate them from
source artwork before submission if the branding changes.

| File                           | Size        | Notes                                                             |
| ------------------------------ | ----------- | ----------------------------------------------------------------- |
| `assets/icon.png`              | 1024 × 1024 | App icon (square, no transparency for iOS, rounded automatically) |
| `assets/adaptive-icon.png`     | 1024 × 1024 | Android foreground (transparent background, centered logo)        |
| `assets/splash.png`            | 2048 × 2048 | Centered logo on solid bg — fills screen                          |
| `assets/notification-icon.png` | 96 × 96     | Android: white/monochrome on transparent                          |
| `assets/favicon.png`           | 192 × 192   | Web — referenced by PWA manifest                                  |
| `assets/og-image.png`          | 1200 × 630  | OG share preview (Twitter, Slack, etc.)                           |

Suggested tools: Figma (free), Icon Kitchen (https://icon.kitchen) for adaptive icons.

---

## 3. Store listing assets

### App Store (iOS)

- Screenshots — 6.7" iPhone (Pro Max) **required**, 5.5" iPhone optional. iPad screenshots are not needed while `supportsTablet=false`.
- App preview videos optional
- App description (max 4000 chars) + promotional text (170 chars) + keywords (100 chars total, comma-separated)
- Support URL + Marketing URL + Privacy Policy URL
- Age rating questionnaire
- App Store category (Health & Fitness recommended)

### Play Store (Android)

- Screenshots — minimum 2, max 8, phone + tablet
- Feature graphic — 1024 × 500 (shown at top of listing)
- High-res icon — 512 × 512
- Short description (80 chars) + full description (4000 chars)
- Privacy policy URL
- Content rating questionnaire
- Target audience and content settings

---

## 4. Code-side prep (automatable, mostly done)

- ✅ TypeScript clean (`npx tsc --noEmit`)
- ✅ `eas.json` exists; submit credentials are intentionally not committed
- ✅ `app.json` configured with bundleId, package, version, buildNumber, versionCode
- ✅ iOS privacy strings (NSUserNotificationsUsageDescription, NSUserTrackingUsageDescription)
- ✅ Android permissions minimised + blocked list
- ✅ Health Connect permissions limited to `READ_STEPS` and `READ_SLEEP`
- ✅ Health Connect privacy-policy/rationale activity wired through `plugins/with-health-connect-rationale.js`
- ✅ ErrorBoundary at app root
- ✅ Sentry + PostHog wired (lazy-loaded — uses env vars)
- ✅ expo-updates configured for OTA
- ✅ PWA manifest + meta tags for web
- ✅ Forgot password + email confirmation flow
- ✅ In-app Privacy & Data screen with export and account deletion request

**Still TODO before submission (you):**

- [ ] Configure App Store Connect credentials locally or in EAS before `eas submit -p ios`
- [ ] Add `play-service-account.json` locally or configure Google Play credentials in EAS before `eas submit -p android`
- [x] Bundle ID / Android package set to `health.lagan.app`
- [ ] Set production env vars in EAS: Supabase URL/key, privacy policy URL, Sentry DSN, and PostHog key/host
- [ ] Register every EAS/Play signing SHA-1 in the Google Android OAuth client, then keep `EXPO_PUBLIC_GOOGLE_NATIVE_ANDROID_AUTH=true` in the production EAS environment
- [ ] Add the exact native, PWA, recovery, and admin callbacks documented in README to Supabase Auth redirect URLs
- [ ] Set website `APPLE_TEAM_ID` and `ANDROID_APP_LINK_SHA256_FINGERPRINTS`; verify both `/.well-known` association endpoints return HTTP 200
- [ ] Upgrade Supabase from Free if needed; custom domains require a paid plan/add-on
- [ ] Configure and activate a Supabase custom domain such as `auth.lagan.health`
- [ ] Add `https://auth.lagan.health/auth/v1/callback` to the Google OAuth client's authorized redirect URIs
- [ ] After the custom domain is active, update `EXPO_PUBLIC_SUPABASE_URL` to `https://auth.lagan.health` in `.env.local`, EAS env, and web build env
- [ ] Deploy the public account deletion page and set `EXPO_PUBLIC_ACCOUNT_DELETION_URL` to `https://your-domain/account-deletion`
- [ ] Confirm the account deletion page renders `privacy@lagan.health` (the env override is optional)

**Email deliverability (see README → Email setup):**

- [ ] Add the Namecheap Private Email **DKIM** record (`default._domainkey.lagan.health`) — SPF/MX already point to Private Email
- [ ] Enable Supabase **custom SMTP** (`mail.privateemail.com:587`, `support@lagan.health`) for auth emails, and raise the auth email rate limit
- [ ] Publish the `token_hash` callback support to the production PWA and supported native runtime before changing email templates
- [ ] Deploy the website handoff, then run `npm run check:auth-remote` and `npm run sync:auth-remote` to publish the exact redirects and source-controlled templates
- [ ] Retain the old `/reset-password` allow-list entry until cutover passes and previously issued emails have expired
- [ ] Set edge-function secret `SUPPORT_NOTIFY_EMAIL=support@lagan.health`; confirm `RESEND_API_KEY` + `WELCOME_EMAIL_SECRET` are set
- [ ] Send a test signup + password reset and confirm both arrive (SPF/DKIM pass) and a reply reaches the `support@lagan.health` inbox
- [ ] Verify the Play Console account deletion URL returns HTTP 200 without sign-in before submitting
- [ ] Create a Play review test account and put the credentials in Play Console "App access"
- [ ] Record a short reviewer video showing sign-in, Health Connect step/sleep sync, Privacy & Data, and account deletion

---

## 5. Build & submit walkthrough

```bash
# 0. One-time setup
npx eas-cli login
npx eas-cli init                      # creates EAS project, fills projectId in app.json

# 1. Build for internal testing (preview profile)
npx eas-cli build -p ios --profile preview        # iOS simulator build for QA
npx eas-cli build -p android --profile preview    # Android internal APK
# Test thoroughly with QA.md

# 2. Production build
npx eas-cli build -p ios --profile production
npx eas-cli build -p android --profile production

# 3. Submit
npx eas-cli submit -p ios       # → App Store Connect (TestFlight first)
npx eas-cli submit -p android   # → Play Console internal track
# Promote through TestFlight / Play Console testing tracks before public release.

# 4. Web deploy
npx expo export -p web
npx vercel --prod ./dist        # or `netlify deploy --prod --dir=dist`

# 5. After release: OTA hotfixes
npx eas-cli update --branch production --message "Fix streak counter rollover"
```

### Android release optimization & Play Console advisories

This is a CNG project — there is no `android/` directory in the repo. Everything below is expressed
in `app.json` or `plugins/with-lagan-android-release.js` and is regenerated by `expo prebuild` on
EAS. Never hand-edit generated Gradle or manifest files; the change will be lost on the next build.

- **R8 is on.** `enableMinifyInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds` in the
  `expo-build-properties` plugin. Keep rules live in `plugins/lagan-proguard-rules.pro` and are
  appended to `android/app/proguard-rules.pro` at prebuild. Note that `expo-notifications` ships
  keep rules but does **not** declare `consumerProguardFiles`, so its rule is replicated by hand —
  do not delete it, or habit reminders can break in release builds only.
- **Sentry native stack traces are obfuscated, deliberately.** The R8 mapping file is _not_ uploaded:
  `experimental_android.enableAndroidGradlePlugin` is off, so the Sentry Android Gradle Plugin is
  never applied. Enabling it once failed the production build at
  `:app:uploadSentryProguardMappingsRelease`, because the `production` profile does not set
  `SENTRY_DISABLE_AUTO_UPLOAD`, so the upload runs and needs a real token. JavaScript errors are
  unaffected — those use source maps on a separate path.
  Before re-enabling it, **confirm the EAS secret actually exists** with `npx eas-cli secret:list`.
  The `"SENTRY_AUTH_TOKEN": "$SENTRY_AUTH_TOKEN"` line in `eas.json` is a _reference_ to a secret,
  not evidence one is configured. Ship it as its own build, never batched with other native changes.
- **MainActivity is `resizeableActivity="true"` but still portrait-locked.** The portrait lock comes
  from the top-level `orientation` key in `app.json`, which is shared with iOS. Unlocking landscape
  needs a real QA pass over all screens first — only `components/pro-comparison.tsx` currently reads
  `useWindowDimensions`.
- **Residual "deprecated window API" advisories are expected and are not app bugs.** Play Console
  will keep listing `com.facebook.react.modules.statusbar.StatusBarModule`,
  `com.facebook.react.views.view.WindowUtilKt`, `com.swmansion.rnscreens.ScreenWindowTraits`, and
  the Material entries (`BottomSheetDialog`, `SheetDialog`, `EdgeToEdgeUtils`). Every one of those
  call sites is inside React Native 0.81.5, react-native-screens 4.16.0, or Material 1.12.0
  bytecode — all pinned by Expo SDK 54 — and they clear only with an SDK 55 / RN 0.82 upgrade. The
  app itself sets no status- or navigation-bar colours (`<StatusBar style>` only), edge-to-edge is
  forced on by SDK 54, and `targetSdkVersion` is 36.
- **Do not try to force Material past 1.12.x to clear those advisories.** It was tried and it fails
  the build: 1.13+ removes `R.attr.colorError`, which react-native-screens 4.16.0 references in
  `TabsHostAppearanceApplicator.kt`, so `:react-native-screens:compileReleaseKotlin` dies with
  "Unresolved reference 'colorError'". No Material version both drops the deprecated window calls
  and keeps `colorError`. See the note at the top of `plugins/with-lagan-android-release.js`.

---

## 6. Post-launch monitoring

- **Sentry dashboard** → check daily for new error spikes
- **PostHog dashboard** → watch DAU, habit_completed events, funnel drop-offs
- **App Store Connect / Play Console** → review crashes, ANRs, ratings
- **Supabase dashboard** → table size, auth usage, free tier quota

---

## 7. Compliance notes

- **GDPR / CCPA**: privacy policy must list the data you collect (email, habit logs, device
  identifiers via PostHog/Sentry). Provide a delete-account flow if collecting personal data
  in the EU/CA — Supabase makes this easy via `supabase.auth.admin.deleteUser`.
- **Apple App Tracking Transparency**: PostHog uses IDFA on iOS — `NSUserTrackingUsageDescription`
  is set in `app.json`. The OS prompt appears on first launch.
- **Children's privacy (COPPA)**: don't market the app to under-13s without consent flow.
- **Data Safety form (Play Store)**: declare what you collect (email, app usage). Be honest —
  Google audits this.

### Google Play policy lockdown

Use this worksheet when completing **Policy > App content** in Play Console.

**Target API**

- Expo SDK 54 targets Android API 36 by default, which satisfies the current Play requirement for new apps and app updates to target Android 15 / API 35 or higher.
- Keep `npx expo-doctor` and `npx expo install --check` green before every release.

**Account deletion**

- In-app path: Android app > Settings > Privacy & Data > Request account deletion.
- External URL: `https://lagan.health/account-deletion`.
- Before submission this URL must load publicly, mention Lagan by name, and provide a way to request deletion without reinstalling the app.

**Health Apps declaration**

- Declare that the app provides health/fitness features.
- Select **Activity and Fitness** for walking/steps and **Sleep Management** for sleep tracking.
- Do not select medical-device, medical-diagnosis, clinical decision support, disease management, emergency, or children-only use cases unless the product changes.
- Health Connect permissions to request in Play Console:
  - `android.permission.health.READ_STEPS`: reads today's step total when the user taps sync, then stores the total against the Walk habit.
  - `android.permission.health.READ_SLEEP`: reads last-night sleep sessions when the user taps sync, then stores duration/stage summary for the sleep dashboard and habit progress.
- Reviewer note: Health Connect sync is optional; users can log habits manually if they do not grant health permissions.

**Data Safety form draft**

- Personal info: email address and Supabase auth user ID. Purpose: account management, app functionality.
- Health and fitness: habit logs, step totals, sleep duration/stage summaries. Purpose: app functionality, analytics/personalization inside the app. Do not mark as sold or used for ads.
- App activity: screen/app interactions and habit events through PostHog when analytics are enabled. Purpose: analytics, product improvement.
- App info and performance: crash logs/diagnostics through Sentry. Purpose: crash reporting, reliability.
- Device or other IDs: declare if PostHog/Sentry SDK configuration reports installation/device identifiers.
- Security practices: data is transmitted over HTTPS; account deletion and in-app data export are available; analytics opt-out is available in Privacy & Data.

---

## 8. Pricing & monetization

The app currently has no purchase flow. If you add IAP later:

- Lagan Pro uses RevenueCat (`react-native-purchases`) with entitlement `pro`
  and Google Play product ids `rc_49_1m` (monthly) / `rc_499_12m` (annual).
- Set `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`,
  `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`, `REVENUECAT_SECRET_API_KEY`, and
  `REVENUECAT_WEBHOOK_AUTH_TOKEN` before release.
- Apple takes 30% (15% for under $1M/yr revenue)
- Google takes 30% (15% for first $1M/yr per developer)
- Subscriptions need server-side validation — Supabase Edge Functions can verify receipts.
