# Lagan R8 keep rules
#
# Appended to android/app/proguard-rules.pro by plugins/with-lagan-android-release.js.
#
# Only rules that are NOT already applied automatically belong here. The following
# ship their own consumerProguardFiles and must NOT be duplicated:
#   react-native (ReactAndroid/build.gradle.kts), expo-modules-core, expo-updates,
#   react-native-reanimated, react-native-worklets, react-native-svg,
#   react-native-health-connect.
# AGP also generates keep rules for anything declared in the merged manifest
# (MainActivity, LaganWidgetProvider, HealthConnectRationaleActivity).

# --- expo-notifications -------------------------------------------------------
# expo-notifications ships android/proguard-rules.pro but never declares
# consumerProguardFiles, so its own rule is not applied. Replicated here; without
# it, R8 can strip the reflectively-loaded notification trigger/serializer classes
# and habit reminders stop firing.
-keep class expo.modules.notifications.** { *; }

# --- expo-health-connect ------------------------------------------------------
# No consumer rules declared.
-keep class expo.modules.healthconnect.** { *; }

# --- Lagan's own native module and widget -------------------------------------
# LaganWidgetModule builds the provider ComponentName from a string
# ("${context.packageName}.LaganWidgetProvider"), which R8 cannot trace back to
# the class, so the widget update broadcast needs an explicit keep.
-keep class health.lagan.** { *; }

# --- Expo module DSL ----------------------------------------------------------
# ModuleDefinition resolves AsyncFunction/Function argument types reflectively.
-keepclassmembers class ** extends expo.modules.kotlin.modules.Module { *; }

# --- React Native libraries without consumer rules ----------------------------
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }

# --- Billing and telemetry ----------------------------------------------------
# Defensive: a silent strip on either path is expensive to diagnose in production.
-keep class com.revenuecat.purchases.** { *; }
-keep class io.sentry.** { *; }
-dontwarn io.sentry.**

# --- Readable native stack traces ---------------------------------------------
# Required for Sentry to deobfuscate Java/Kotlin frames using the uploaded
# mapping file (see experimental_android.enableAndroidGradlePlugin in app.json).
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions, SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile
