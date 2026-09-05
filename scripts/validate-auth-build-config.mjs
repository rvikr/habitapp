const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const appUrl = process.env.EXPO_PUBLIC_APP_URL;
const nativeBuild = process.argv.includes("--native");

if (!supabaseUrl || !supabaseKey || (!nativeBuild && !appUrl)) {
  throw new Error("Auth build configuration is incomplete for this build target.");
}

if (!nativeBuild) {
  const parsedAppUrl = new URL(appUrl);
  if (parsedAppUrl.protocol !== "https:" || parsedAppUrl.pathname.replace(/\/+$/, "") !== "/app") {
    throw new Error("EXPO_PUBLIC_APP_URL must be an HTTPS URL whose path is /app.");
  }
}

if (nativeBuild && process.env.EAS_BUILD_PROFILE === "production") {
  const platform = process.env.EAS_BUILD_PLATFORM;
  if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    throw new Error("Production native Google Sign-In configuration is incomplete.");
  }
  if (platform === "android" && process.env.EXPO_PUBLIC_GOOGLE_NATIVE_ANDROID_AUTH !== "true") {
    throw new Error("Production Android Google Sign-In configuration is incomplete.");
  }
  if (platform === "ios" && !process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY) {
    throw new Error("Production iOS RevenueCat configuration is incomplete.");
  }
  if (platform === "android" && !process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY) {
    throw new Error("Production Android RevenueCat configuration is incomplete.");
  }
}

const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
  headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
});
if (!response.ok) {
  throw new Error(`Supabase rejected the configured public client key (HTTP ${response.status}).`);
}

console.log(`Auth build configuration is valid for ${nativeBuild ? "native" : "web"}.`);
