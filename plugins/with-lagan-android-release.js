const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");

const { getMainActivityOrThrow } = AndroidConfig.Manifest;

const TAG = "with-lagan-android-release";
const PROGUARD_MARKER = "# BEGIN lagan-proguard-rules";
const PROGUARD_END_MARKER = "# END lagan-proguard-rules";

// NOTE: Do not try to force com.google.android.material:material past 1.12.x here.
// Material 1.13+ drops the Android 15 deprecated Window.setStatusBarColor /
// setNavigationBarColor calls that Play Console flags in BottomSheetDialog, SheetDialog and
// EdgeToEdgeUtils — but it also removes R.attr.colorError, which react-native-screens 4.16.0
// references in TabsHostAppearanceApplicator.kt. Forcing 1.13.0 fails the build at
// :react-native-screens:compileReleaseKotlin with "Unresolved reference 'colorError'".
// Those advisories clear with an Expo SDK upgrade, not a Material bump.

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
  config = withResizeableMainActivity(config);
  return config;
};

module.exports = createRunOncePlugin(withLaganAndroidRelease, TAG, "1.0.0");
