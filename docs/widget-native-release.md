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

## Corrective-build regression gate

The first 1.1.0 internal binaries exposed responsive-layout and Android live-data
defects. Do not promote those artifacts. A replacement native build must pass all
of the following before the server kill switch is enabled:

1. On iOS, add the widget in small, medium, and large sizes. Resize or replace it
   between every family and confirm the action is fully visible, labels do not
   overlap, and steps/rank remain readable.
2. On Android, test the smallest square, short horizontal, and tall layouts.
   Resize in both directions and confirm the action is never clipped. Compact
   layouts may hide the next-habit line, but must retain steps, rank, action
   status, and the action button.
3. With step tracking enabled and Health access granted, open the Today screen
   and confirm today's device step count appears on the widget even when no
   habit is classified as a steps habit.
4. With a leaderboard display name set, confirm the widget shows the same
   all-time rank as the in-app all-time leaderboard. It must never show total
   users. Repeat after foregrounding the app and after pull-to-refresh.
5. Test light and dark system themes on both platforms.
6. Keep `WIDGET_BACKGROUND_ACTIONS_ENABLED=false` while validating display and
   resizing. Then enable it only for the direct-action test cohort and verify a
   server-confirmed success message after every accepted check-in.

These corrections change native Swift/Kotlin resources and cannot be delivered
through EAS Update. Publish new TestFlight and Google Play internal-test builds.

## Siri and Shortcuts regression gate

Siri habit logging is also native-binary-only. Do not run `eas update` for the
App Intent, its localized resources, the habit entity catalog, or the Settings
discovery screen. Bundle all of them in the replacement iOS 1.1.0 binary.

Before promoting that binary:

1. Keep the production `WIDGET_BACKGROUND_ACTIONS_ENABLED` server secret false.
   Internal testing must use a non-production backend or an explicitly isolated
   test environment.
2. On iOS 16 and the current iOS release, confirm **Log Habit** appears in the
   Shortcuts app after opening Lagan and syncing Today.
3. Test a named phrase and the generic habit prompt in English and Hindi. Verify
   the selected habit UUID remains stable after completing the habit.
4. Confirm quantity habits log only their configured default increment, never
   exceed the target, and report success only after a 2xx server receipt.
5. Test already-complete and archived habits, signed-out and expired sessions,
   airplane-mode queueing, FIFO replay, queue-full handling, and repeated runs
   with distinct operation UUIDs.
6. Confirm a successful Siri run does not foreground Lagan, sign-out clears the
   credential and pending queue, and existing WidgetKit check-in still works.

The repository may remain configured for EAS Update generally; the release
boundary is that no update is published for this feature. Current installed
binaries therefore receive no Siri code or Settings UI.

## Rollback

Set `WIDGET_BACKGROUND_ACTIONS_ENABLED=false`. Native widgets then retain
read-only cached display and app-opening fallback without affecting the normal
in-app completion path. Device credentials are revoked on sign-out/account
deletion and expire after 30 days.
