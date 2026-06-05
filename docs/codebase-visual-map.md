# Lagan Codebase Visual Map

This document maps how the repo fits together at runtime. It focuses on the code paths that drive the app experience: auth, habit tracking, progress, leaderboard, AI coaching, reminders, subscriptions, website/admin, and Supabase.

## System Overview

```mermaid
flowchart LR
  User["User"]

  subgraph MobileWebApp["Root Expo app"]
    ExpoRouter["expo-router routes in app/"]
    Providers["Root providers: theme, language, tracking, celebration"]
    Components["Reusable React Native components"]
    DataLib["lib/data: reads and mutations"]
    CoachLib["lib/coach: habit intelligence, streaks, XP, AI helpers"]
    PlatformLib["lib/platform: native/web adapters"]
    Subscriptions["lib/subscription: RevenueCat access"]
  end

  subgraph NextSite["website/ Next.js app"]
    Landing["Marketing pages"]
    WebDashboard["Authenticated web dashboard"]
    Admin["Admin users, content, analytics, audit, system"]
    ServerActions["Next server actions"]
  end

  subgraph Supabase["Supabase backend"]
    Auth["Supabase Auth"]
    Database["Postgres tables, RLS, RPCs"]
    EdgeFunctions["Edge Functions"]
  end

  subgraph External["External services"]
    Gemini["Gemini AI"]
    RevenueCat["RevenueCat"]
    Sentry["Sentry"]
    PostHog["PostHog"]
    Health["HealthKit, Health Connect, Pedometer"]
    Push["Native notifications and Web Push"]
  end

  User --> ExpoRouter
  User --> NextSite
  ExpoRouter --> Providers
  ExpoRouter --> Components
  Components --> DataLib
  ExpoRouter --> DataLib
  DataLib --> CoachLib
  DataLib --> Supabase
  CoachLib --> EdgeFunctions
  PlatformLib --> Health
  PlatformLib --> Push
  Subscriptions --> RevenueCat
  Subscriptions --> EdgeFunctions
  Providers --> Sentry
  Providers --> PostHog
  WebDashboard --> ServerActions
  Admin --> ServerActions
  ServerActions --> Supabase
  EdgeFunctions --> Database
  EdgeFunctions --> Gemini
  EdgeFunctions --> RevenueCat
  Supabase --> Auth
  Supabase --> Database
```

## Main Runtime Surfaces

```mermaid
flowchart TB
  Repo["habbitapp repo"]

  Repo --> RootExpo["Root Expo app"]
  Repo --> Website["website/ Next.js app"]
  Repo --> Backend["supabase/ backend"]
  Repo --> NativeModule["modules/lagan-widget native module"]
  Repo --> Deploy["Deployment and build files"]

  RootExpo --> AppRoutes["app/ file-based routes"]
  RootExpo --> SharedComponents["components/"]
  RootExpo --> SharedLib["lib/"]
  RootExpo --> Assets["assets/ and public/"]

  Website --> WebRoutes["website/app routes"]
  Website --> WebComponents["website/components"]
  Website --> WebLib["website/lib"]

  Backend --> Schema["schema.sql and migrations"]
  Backend --> Functions["Edge Functions"]
  Backend --> SQLRPC["RPCs and views"]

  Deploy --> EAS["eas.json for mobile"]
  Deploy --> CloudRun["Dockerfile, nginx.conf, cloudbuild.yaml for Expo web"]
  Deploy --> NextBuild["website/package.json for Next app"]
```

## Expo Route Map

```mermaid
flowchart TB
  Root["app/_layout.tsx"]
  Root --> Public["Public routes"]
  Root --> Tabs["app/(tabs)/_layout.tsx"]
  Root --> HabitStack["Habit modal stack"]
  Root --> Pro["app/pro.tsx"]

  Public --> Login["login.tsx: email, password, Google"]
  Public --> Callback["auth/callback.tsx: OAuth and password reset callback"]
  Public --> Reset["reset-password.tsx"]
  Public --> AccountDeletion["account-deletion.tsx"]

  Tabs --> Today["index.tsx: Today dashboard"]
  Tabs --> Achievements["achievements.tsx: badges, XP, weekly report"]
  Tabs --> Progress["progress.tsx: momentum, consistency, sleep, life balance"]
  Tabs --> Leaderboard["leaderboard.tsx: ranks and opt-in"]
  Tabs --> Settings["settings stack"]

  Settings --> SettingsHome["settings/index.tsx"]
  Settings --> Profile["settings/profile.tsx"]
  Settings --> Reminders["settings/reminders.tsx"]
  Settings --> Coach["settings/coach.tsx"]
  Settings --> Feedback["settings/feedback.tsx"]
  Settings --> Security["settings/security.tsx"]
  Settings --> Privacy["settings/privacy.tsx"]

  HabitStack --> NewHabit["habits/new.tsx"]
  HabitStack --> Wizard["habits/wizard.tsx"]
  HabitStack --> HabitDetail["habits/[id]/index.tsx"]
  HabitStack --> HabitEdit["habits/[id]/edit.tsx"]
```

## App Boot And Auth Flow

```mermaid
sequenceDiagram
  participant App as app/_layout.tsx
  participant Providers as App providers
  participant Supabase as lib/supabase/client.ts
  participant RevenueCat as lib/subscription/revenuecat.ts
  participant Router as expo-router
  participant Services as Sentry and PostHog

  App->>Services: initSentry() and initAnalytics()
  App->>Providers: mount ErrorBoundary, SafeArea, Theme, Language, Tracking, Celebration
  App->>Supabase: isSupabaseConfigured()
  alt missing env vars
    App-->>Router: render configuration error
  else configured
    App->>Supabase: getCurrentSession()
    Supabase-->>App: session or null
    App->>Router: redirect signed-out users to /login
    App->>Router: redirect signed-in users away from /login
    App->>Services: set Sentry user and track screen views
    App->>RevenueCat: sync or log out subscription state
    App->>Supabase: subscribe to auth state changes
  end
```

## Today Dashboard Flow

```mermaid
sequenceDiagram
  participant Screen as app/(tabs)/index.tsx
  participant Reads as lib/data/habits.ts
  participant Actions as lib/data/actions.ts
  participant Cache as lib/data/cache.ts
  participant Coach as lib/coach
  participant Platform as lib/platform
  participant Supabase as Supabase Postgres and RPCs
  participant Widget as lib/widgets/home-widget.ts

  Screen->>Reads: getHabitsForToday()
  Screen->>Reads: getStats()
  Reads->>Cache: readThroughCache()
  Reads->>Supabase: read habits, habit_completions, profiles
  Reads->>Coach: progressForHabit(), streakFromDates(), buildCoachSignals()
  Coach->>Supabase: optionally invoke coach-message Edge Function
  Reads-->>Screen: habits, completedToday, progress, streaks, profile, coachSignal

  alt user toggles normal habit
    Screen->>Actions: toggleHabit(habitId, currentlyDone, target)
    Actions->>Supabase: upsert or delete habit_completions
    Actions->>Cache: clearDataCache()
    Actions->>Platform: scheduleReminderSync()
    Actions-->>Screen: ok or error
  else step habit with tracking enabled
    Screen->>Platform: request and read steps
    Platform-->>Screen: step snapshot or live pedometer updates
    Screen->>Actions: setCompletionValue()
    Actions->>Supabase: upsert habit_completions value
  end

  Screen->>Reads: reload with force
  Screen->>Widget: syncHomeWidgetFromDashboard()
```

## Habit Creation And AI Routine Flow

```mermaid
sequenceDiagram
  participant Wizard as app/habits/wizard.tsx
  participant LocalBuilder as lib/coach/routine-builder.ts
  participant Pro as lib/subscription/revenuecat.ts
  participant AI as lib/coach/routine-ai.ts
  participant Actions as lib/data/actions.ts
  participant Validation as lib/habits/validate*.ts
  participant Supabase as Supabase

  Wizard->>LocalBuilder: buildRoutineRecommendations(answers)
  Wizard->>Pro: getCurrentProAccess()
  alt has Pro
    Wizard->>AI: refineRoutineRecommendations()
    AI->>Supabase: invoke habit-routine Edge Function
    Supabase-->>AI: AI-refined recommendations
  else no Pro
    Wizard-->>Wizard: show Pro upgrade banner
  end
  Wizard->>Actions: createHabit() for selected recommendations
  Actions->>Validation: validateHabitLocally()
  alt uncertain validation
    Validation->>Supabase: invoke validate-habit Edge Function
  end
  Actions->>Actions: inferHabitIntelligence()
  Actions->>Supabase: check similar active habits
  alt similar habit found
    Actions->>Supabase: update and merge settings
  else new habit
    Actions->>Supabase: insert habits row
  end
  Actions->>Supabase: schedule reminders as needed
  Actions-->>Wizard: created ids or validation errors
  Wizard-->>Wizard: navigate back to Today
```

## Feature Flow Map

```mermaid
flowchart LR
  subgraph Screens["User-facing screens"]
    Today["Today"]
    HabitDetail["Habit detail"]
    HabitWizard["Habit wizard"]
    Progress["Progress"]
    Achievements["Achievements"]
    Leaderboard["Leaderboard"]
    Settings["Settings"]
    Pro["Pro"]
    WebsiteDash["Web dashboard"]
    Admin["Web admin"]
  end

  subgraph Features["Feature modules"]
    HabitReads["Habit reads and stats"]
    HabitMutations["Habit create, update, delete, complete"]
    HabitAI["Habit validation and AI routine"]
    Coach["AI coach"]
    Reminders["Smart and scheduled reminders"]
    SleepSteps["Sleep and step tracking"]
    XPBadges["XP, streaks, badges"]
    Ranking["Leaderboard"]
    Subscription["Pro access"]
    Privacy["Privacy, export, account deletion"]
    Observability["Analytics and crash reporting"]
    AdminTools["Admin content, users, flags, audit"]
  end

  Today --> HabitReads
  Today --> HabitMutations
  Today --> Coach
  Today --> SleepSteps
  Today --> Subscription
  Today --> Reminders
  HabitDetail --> HabitReads
  HabitDetail --> HabitMutations
  HabitWizard --> HabitAI
  Progress --> HabitReads
  Progress --> XPBadges
  Progress --> SleepSteps
  Achievements --> XPBadges
  Leaderboard --> Ranking
  Settings --> Reminders
  Settings --> Privacy
  Settings --> Coach
  Settings --> Observability
  Pro --> Subscription
  WebsiteDash --> HabitReads
  WebsiteDash --> HabitMutations
  Admin --> AdminTools
```

## Supabase Backend Map

```mermaid
flowchart TB
  subgraph Database["Postgres data model"]
    AuthUsers["auth.users"]
    Profiles["profiles"]
    Habits["habits"]
    Completions["habit_completions"]
    SleepEntries["sleep_entries"]
    Feedback["feedback_reports"]
    Deletion["account_deletion_requests"]
    FeatureFlags["feature_flags"]
    SuggestedHabits["suggested_habits"]
    Notifications["global_notifications"]
    AIQuota["ai_usage_counters and ai_usage_events"]
    Subscriptions["subscriptions/pro access"]
    Reports["weekly_progress_reports"]
    WebPush["web_push_subscriptions and web_push_sends"]
  end

  AuthUsers --> Profiles
  Profiles --> Habits
  Habits --> Completions
  Habits --> SleepEntries
  Profiles --> Reports
  Profiles --> WebPush
  FeatureFlags --> AIQuota
  SuggestedHabits --> Habits

  subgraph RPCs["RPCs and views"]
    PublicStats["get_public_stats"]
    LogCompletion["log_habit_completion"]
    LeaderboardEntries["get_leaderboard_entries"]
    LeaderboardPosition["get_leaderboard_position"]
    ConsumeAI["consume_ai_quota"]
    HasPro["has_pro_access"]
    PublicProfiles["public_profiles view"]
  end

  Completions --> LogCompletion
  Profiles --> LeaderboardEntries
  Completions --> LeaderboardEntries
  Profiles --> LeaderboardPosition
  AIQuota --> ConsumeAI
  Subscriptions --> HasPro
```

## Edge Functions

```mermaid
flowchart LR
  subgraph ClientCallers["Client callers"]
    MobileLib["Expo lib/"]
    WebsiteLib["Next website/"]
    Cron["Scheduled or external calls"]
    RevenueCatWebhook["RevenueCat webhook"]
  end

  subgraph Functions["supabase/functions"]
    CoachMessage["coach-message"]
    HabitRoutine["habit-routine"]
    SmartReminders["smart-reminders"]
    ValidateHabit["validate-habit"]
    LeaderboardFn["leaderboard"]
    DeleteAccount["delete-account"]
    SyncSubscription["sync-subscription"]
    RevenueCatFn["revenuecat-webhook"]
    ProgressReport["progress-report"]
    WebPushReminders["web-push-reminders"]
  end

  MobileLib --> CoachMessage
  MobileLib --> HabitRoutine
  MobileLib --> SmartReminders
  MobileLib --> ValidateHabit
  MobileLib --> LeaderboardFn
  MobileLib --> DeleteAccount
  MobileLib --> SyncSubscription
  WebsiteLib --> LeaderboardFn
  WebsiteLib --> DeleteAccount
  Cron --> ProgressReport
  Cron --> WebPushReminders
  RevenueCatWebhook --> RevenueCatFn

  CoachMessage --> Gemini["Gemini shared helper"]
  HabitRoutine --> Gemini
  SmartReminders --> Gemini
  ValidateHabit --> Gemini
  ProgressReport --> Gemini

  CoachMessage --> Guard["ai-guard quota"]
  HabitRoutine --> Guard
  SmartReminders --> Guard
  ValidateHabit --> Guard
  ProgressReport --> Guard

  Guard --> DB["Postgres"]
  LeaderboardFn --> DB
  DeleteAccount --> DB
  SyncSubscription --> RevenueCat["RevenueCat API"]
  RevenueCatFn --> DB
  WebPushReminders --> DB
```

## Website And Admin Flow

```mermaid
flowchart TB
  subgraph PublicWeb["Public website routes"]
    Home["website/app/page.tsx"]
    Login["website/app/login"]
    Privacy["privacy"]
    Terms["terms"]
    AccountDeletion["account-deletion"]
    OG["api/og/card"]
  end

  subgraph AppWeb["Authenticated app routes"]
    Layout["website/app/(app)/layout.tsx"]
    Dashboard["dashboard"]
    WebLeaderboard["leaderboard"]
    WebAchievements["achievements"]
    WebSettings["settings"]
  end

  subgraph AdminWeb["Admin routes"]
    AdminLayout["admin/layout.tsx"]
    Users["admin/users"]
    Content["admin/content"]
    System["admin/system"]
    Analytics["admin/analytics"]
    Audit["admin/audit"]
  end

  subgraph WebLib["website/lib"]
    ServerSupabase["supabase/server.ts"]
    AdminSupabase["supabase/admin.ts"]
    WebHabits["habits.ts"]
    WebStats["stats.ts"]
    AdminAuth["admin/auth.ts"]
    AdminAudit["admin/audit.ts"]
  end

  Home --> WebStats
  Login --> ServerSupabase
  Dashboard --> WebHabits
  Dashboard --> ServerActions["dashboard/actions.ts"]
  WebLeaderboard --> ServerSupabase
  WebSettings --> ServerSupabase
  AdminLayout --> AdminAuth
  Users --> AdminSupabase
  Content --> AdminSupabase
  System --> AdminSupabase
  Analytics --> AdminSupabase
  Audit --> AdminAudit
  ServerSupabase --> Supabase["Supabase Auth and Postgres"]
  AdminSupabase --> Supabase
```

## Platform Adapter Map

```mermaid
flowchart LR
  SharedCalls["App code imports stable adapter names"]

  SharedCalls --> Storage["storage.ts"]
  SharedCalls --> SecureStorage["secure-storage.ts"]
  SharedCalls --> Notifications["notifications.ts"]
  SharedCalls --> Haptics["haptics.ts"]
  SharedCalls --> Steps["steps.ts"]
  SharedCalls --> Sleep["sleep.ts"]
  SharedCalls --> HomeWidget["home-widget.ts"]
  SharedCalls --> StoreReview["store-review.ts"]

  Storage --> StorageNative["storage.native.ts"]
  Storage --> StorageWeb["storage.web.ts"]
  SecureStorage --> SecureNative["secure-storage.native.ts"]
  SecureStorage --> SecureWeb["secure-storage.web.ts"]
  Notifications --> NotificationsNative["notifications.native.ts"]
  Notifications --> NotificationsWeb["notifications.web.ts"]
  Haptics --> HapticsNative["haptics.native.ts"]
  Haptics --> HapticsWeb["haptics.web.ts"]
  Steps --> StepsNative["steps.native.ts"]
  Steps --> StepsWeb["steps.web.ts"]
  Sleep --> SleepNative["sleep.native.ts"]
  Sleep --> SleepWeb["sleep.web.ts"]
  HomeWidget --> WidgetAndroid["home-widget.android.ts"]
  HomeWidget --> WidgetIOS["home-widget.ios.ts"]
  HomeWidget --> WidgetWeb["home-widget.web.ts"]
```

## Feature Inventory

| Feature                  | Entry points                                                  | Core modules                                                                         | Backend                                                     |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Authentication           | `app/login.tsx`, `app/auth/callback.tsx`, `website/app/login` | `lib/data/actions.ts`, `lib/supabase/client.ts`, `website/lib/supabase/*`            | Supabase Auth                                               |
| Today habit tracking     | `app/(tabs)/index.tsx`                                        | `lib/data/habits.ts`, `lib/data/actions.ts`, `lib/coach/habit-intelligence.ts`       | `habits`, `habit_completions`, `log_habit_completion`       |
| Habit detail/edit/create | `app/habits/*`                                                | `components/habit-form.tsx`, `lib/data/actions.ts`                                   | `habits`, `habit_completions`                               |
| Routine wizard           | `app/habits/wizard.tsx`                                       | `lib/coach/routine-builder.ts`, `lib/coach/routine-ai.ts`                            | `habit-routine`, `validate-habit`                           |
| AI coach                 | Today screen and coach settings                               | `lib/coach/coach.ts`, `lib/coach/coach-ai.ts`                                        | `coach-message`, AI quota tables                            |
| Progress analytics       | `app/(tabs)/progress.tsx`                                     | `lib/data/habits.ts`, `lib/coach/life-balance.ts`, `lib/data/sleep-data.ts`          | `habit_completions`, `sleep_entries`                        |
| Badges and XP            | `app/(tabs)/achievements.tsx`, website achievements           | `lib/coach/xp.ts`, `lib/coach/badges.ts`, `lib/data/progress-reports.ts`             | `weekly_progress_reports`                                   |
| Leaderboard              | `app/(tabs)/leaderboard.tsx`, website leaderboard             | `lib/data/leaderboard.ts`                                                            | `leaderboard` Edge Function, leaderboard RPCs, `profiles`   |
| Reminders                | Settings reminders, notification scheduler                    | `lib/data/reminders.ts`, `lib/data/reminder-sync.ts`, `lib/coach/smart-reminders.ts` | `smart-reminders`, push tables                              |
| Step tracking            | Today dashboard                                               | `lib/platform/steps.native.ts`, `lib/data/steps-shared.ts`                           | `habit_completions`                                         |
| Sleep tracking           | Progress screen                                               | `lib/platform/sleep.native.ts`, `lib/data/sleep-data.ts`, `lib/data/sleep-shared.ts` | `sleep_entries`, `habit_completions`                        |
| Pro subscription         | `app/pro.tsx`, upgrade banners                                | `lib/subscription/revenuecat.ts`, `lib/subscription/access.ts`                       | `sync-subscription`, `revenuecat-webhook`, `has_pro_access` |
| Privacy and deletion     | settings privacy, account deletion pages                      | `lib/utils/privacy.ts`, `lib/data/actions.ts`                                        | `delete-account`, `account_deletion_requests`               |
| Feedback                 | `app/(tabs)/settings/feedback.tsx`                            | `lib/utils/feedback.ts`                                                              | `feedback_reports`                                          |
| Website dashboard        | `website/app/(app)/dashboard`                                 | `website/lib/habits.ts`, dashboard server action                                     | Supabase server client                                      |
| Website admin            | `website/app/admin/*`                                         | `website/lib/admin/*`, admin server actions                                          | service-role Supabase client                                |
| Observability            | root layout and settings privacy                              | `lib/services/sentry.ts`, `lib/services/analytics.ts`                                | Sentry, PostHog                                             |

## Data Ownership Summary

```mermaid
flowchart TB
  AuthUser["Authenticated user"]
  AuthUser --> Profile["profiles: display name, coach tone, avatar, leaderboard opt-in"]
  AuthUser --> Habits["habits: habit definitions and reminder settings"]
  Habits --> Completions["habit_completions: daily logs and metric values"]
  Habits --> SleepEntries["sleep_entries: normalized sleep sessions"]
  AuthUser --> Reports["weekly_progress_reports"]
  AuthUser --> Feedback["feedback_reports"]
  AuthUser --> DeletionRequests["account_deletion_requests"]
  AuthUser --> PushSubs["web_push_subscriptions"]

  AdminUser["Admin user"] --> FeatureFlags["feature_flags"]
  AdminUser --> SuggestedHabits["suggested_habits"]
  AdminUser --> GlobalNotifications["global_notifications"]
  AdminUser --> AuditLog["admin_audit_log"]
```

## Build And Deployment Flow

```mermaid
flowchart LR
  Dev["Developer"]

  Dev --> ExpoDev["npm start / npx expo start"]
  ExpoDev --> IOS["iOS simulator or device"]
  ExpoDev --> Android["Android emulator or device"]
  ExpoDev --> ExpoWeb["Expo web dev"]

  Dev --> Quality["npm run typecheck, lint, test"]
  Dev --> EAS["EAS build profiles"]
  EAS --> AppStores["iOS and Android stores"]

  Dev --> ExpoExport["npx expo export -p web"]
  ExpoExport --> Docker["Dockerfile builds static web"]
  Docker --> Nginx["nginx serves SPA on port 8080"]
  Nginx --> CloudRun["Cloud Run via cloudbuild.yaml"]

  Dev --> NextBuild["cd website && npm run build"]
  NextBuild --> WebsiteDeploy["Separate Next.js deployment"]

  Dev --> SupabaseDeploy["Supabase SQL migrations and functions deploy"]
  SupabaseDeploy --> Supabase["Supabase project"]
```
