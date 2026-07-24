const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  WarningAggregator,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withProjectBuildGradle,
} = require("@expo/config-plugins");

const { getMainActivityOrThrow } = AndroidConfig.Manifest;

const TAG = "with-lagan-android-release";
const PROGUARD_MARKER = "# BEGIN lagan-proguard-rules";
const PROGUARD_END_MARKER = "# END lagan-proguard-rules";
const MATERIAL_MARKER = "// BEGIN lagan-material-force";
const MATERIAL_END_MARKER = "// END lagan-material-force";

// react-native-screens 4.16.0 pulls com.google.android.material:material:1.12.0, which still calls
// Window.setStatusBarColor / setNavigationBarColor from BottomSheetDialog, SheetDialog and
// EdgeToEdgeUtils. Those calls are deprecated in Android 15 and are flagged by Play Console.
// 1.13.x drops them. Forced rather than added as a dependency so the transitive graph stays intact.
const MATERIAL_VERSION = "1.13.0";

function stripManagedBlock(contents, beginMarker, endMarker) {
  const begin = contents.indexOf(beginMarker);
  if (begin === -1) return contents;
  const end = contents.indexOf(endMarker, begin);
  if (end === -1) return contents;
  return contents.slice(0, begin) + contents.slice(end + endMarker.length);
}

/**
 * Append Lagan's keep rules to android/app/proguard-rules.pro.
 *
 * Rules live in a real .pro file next to this plugin rather than in
 * expo-build-properties' `extraProguardRules` string so they stay readable and commentable.
 */
function withLaganProguardRules(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const rulesSource = path.join(__dirname, "lagan-proguard-rules.pro");
      const proguardFile = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "proguard-rules.pro",
      );

      const rules = await fs.promises.readFile(rulesSource, "utf8");
      const existing = await fs.promises.readFile(proguardFile, "utf8");
      const base = stripManagedBlock(existing, PROGUARD_MARKER, PROGUARD_END_MARKER).trimEnd();

      const block = `${PROGUARD_MARKER}\n${rules.trim()}\n${PROGUARD_END_MARKER}\n`;
      await fs.promises.writeFile(proguardFile, `${base}\n\n${block}`);

      return config;
    },
  ]);
}

/**
 * Force com.google.android.material:material to a version without the Android 15 deprecated
 * window colour APIs.
 *
 * Appends a standalone `allprojects` block instead of editing the existing one: Gradle allows
 * repeating it, and @sentry/react-native's plugin also rewrites this file.
 */
function withMaterialVersionForce(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      WarningAggregator.addWarningAndroid(
        TAG,
        `Cannot force com.google.android.material:material:${MATERIAL_VERSION} — android/build.gradle is not Groovy. The Android 15 deprecated window API warnings from Material will remain.`,
      );
      return config;
    }

    const base = stripManagedBlock(
      config.modResults.contents,
      MATERIAL_MARKER,
      MATERIAL_END_MARKER,
    ).trimEnd();

    config.modResults.contents = `${base}

${MATERIAL_MARKER}
allprojects {
  configurations.all {
    resolutionStrategy {
      force 'com.google.android.material:material:${MATERIAL_VERSION}'
    }
  }
}
${MATERIAL_END_MARKER}
`;

    return config;
  });
}

/**
 * Mark MainActivity resizeable so tablets, foldables and Chrome OS get adaptive multi-window
 * behaviour.
 *
 * The portrait lock from app.json's `orientation` is deliberately left in place: that key is
 * shared with iOS, and the phone layouts have not been validated in landscape.
 */
function withResizeableMainActivity(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = getMainActivityOrThrow(config.modResults);
    mainActivity.$["android:resizeableActivity"] = "true";
    return config;
  });
}

const withLaganAndroidRelease = (config) => {
  config = withLaganProguardRules(config);
  config = withMaterialVersionForce(config);
  config = withResizeableMainActivity(config);
  return config;
};

module.exports = createRunOncePlugin(withLaganAndroidRelease, TAG, "1.0.0");
