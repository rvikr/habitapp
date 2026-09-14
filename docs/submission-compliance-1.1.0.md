# Release 1.1.0 store-submission compliance

This is the submission delta for the native widget, Android background step sync,
and Siri/Shortcuts release. It does not replace a final review of the answers
already saved in App Store Connect and Play Console.

## Google Play Console

Before production submission:

1. In **Policy > App content > Health apps**, retain **Activity and Fitness** and
   declare these permissions:
   - `android.permission.health.READ_STEPS`: reads the user's step total to update
     a step habit and widget.
   - `android.permission.health.READ_SLEEP`: reads sleep sessions for the
     user-enabled sleep tracking feature.
   - `android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND`: when separately
     enabled by the user, reads today's step total while Lagan is closed so the
     step habit and widget stay updated.
2. In **Data safety**, verify:
   - **Fitness info** is collected, linked to the user, optional, used for App
     functionality and Product personalization, and not shared.
   - **Health info** retains the existing optional sleep disclosure.
   - **Device or other IDs** includes the pseudonymous widget device ID, linked
     to the user and used for App functionality, if that use is not already covered.
3. Demonstrate the foreground opt-in at **Settings > Tracking > Background widget
   steps**. The disclosure shown immediately before the permission request is:

   > Lagan reads your step count from Health Connect in the background, even when
   > the app is closed, to keep your step habit and home-screen widget updated. Your
   > step total is sent to and stored in your Lagan account. Lagan does not sell it
   > or use it for advertising.

   The available choices are **Enable** and **Not now**. Declining leaves background
   work disabled; direct widget habit check-ins continue to work.

## App Store Connect

Before production submission:

1. In **App Privacy**, verify the existing linked, non-tracking disclosures cover
   Health, Fitness, Other User Content, Device ID, and Product Interaction. Siri
   audio and speech transcripts are not collected by Lagan and should not be added.
2. Inspect the signed host app and widget extension. Both must have the App Group,
   shared Keychain group, HealthKit entitlement, appropriate HealthKit purpose
   string, and a privacy manifest declaring App Group `UserDefaults` with reason
   `1C8F.1`.
3. Add the widget and Siri/Shortcuts behavior to the version metadata and review
   notes. Suggested copy follows.

### What's New

> Add Lagan widgets to see today's progress, steps, and all-time rank at a glance.
> Check in supported habits from the widget, and on iOS use Siri or Shortcuts to
> log a habit. This update also adds saved step and sleep trends and refreshed
> sharing cards.

### App Review notes

> Version 1.1.0 adds home-screen widgets on Android and iOS. Sign in, sync the Today
> screen, then add the Lagan widget from the system widget gallery. Widget habit
> check-ins use a revocable scoped credential and show success only after server
> confirmation. On Android, optional background Health Connect step updates are
> disabled by default and can be enabled at Settings > Tracking > Background widget
> steps; the app shows a prominent disclosure before requesting background access.
> On iOS 16 or later, open Settings > Siri & Shortcuts for sample phrases, or open
> Apple's Shortcuts app and run Lagan's Log Habit intent. Habit names/details may be
> shown by Siri/Shortcuts; Lagan receives the selected check-in and no Siri audio.

## Status boundary

The repository changes implement the permission, disclosure, and manifest behavior.
The live App Store Connect and Play Console answers have not been changed or verified;
those manual console actions must be completed and saved before submission.
