# Native widget 1.1.0 release guardrails

This feature is a native-binary release. Do not run `eas update`, do not publish
its JavaScript to the 1.0.0 runtime, and do not reuse a 1.0.0 build artifact.
`runtimeVersion.policy = appVersion` isolates this code as runtime `1.1.0`.

## Safe rollout order

1. Apply the additive widget migration. Confirm existing app completion and
   leaderboard smoke tests still pass.
2. Deploy `widget-session` and `widget-action` with
   `WIDGET_BACKGROUND_ACTIONS_ENABLED=false`.
3. Build internal iOS and Android 1.1.0 binaries. Confirm iOS App Group,
   Keychain group, HealthKit capability, and Android background Health Connect
   permission in the signed artifacts.
4. Test sign-in, sign-out/revocation, offline queue replay, repeated taps with
   one operation UUID, day rollover, completed/archived habits, steps denied,
   and light/dark mode on physical devices.
5. Enable the server kill switch for internal testers only. Confirm every
   success message follows a 2xx server receipt and widget leaderboard data
   contains the all-time rank field only.
6. Release through TestFlight/Play internal testing, then stage production.

## Rollback

Set `WIDGET_BACKGROUND_ACTIONS_ENABLED=false`. Native widgets then retain
read-only cached display and app-opening fallback without affecting the normal
in-app completion path. Device credentials are revoked on sign-out/account
deletion and expire after 30 days.
