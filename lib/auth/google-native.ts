import type { Platform } from "react-native";

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
export const GOOGLE_NATIVE_ANDROID_AUTH_ENABLED =
  process.env.EXPO_PUBLIC_GOOGLE_NATIVE_ANDROID_AUTH === "true";

export type GoogleNativeAuthEnvironment = {
  nativeAndroidAuthEnabled?: boolean | null;
  webClientId?: string | null;
};

export type GoogleNativePlatform = typeof Platform.OS;

export type GoogleNativeSignInMode = "native" | "oauth";

export type GoogleNativeRuntimeConstants = {
  appOwnership?: string | null;
  executionEnvironment?: string | null;
};

export function isExpoGoRuntime(constants: GoogleNativeRuntimeConstants): boolean {
  return constants.executionEnvironment === "storeClient" || constants.appOwnership === "expo";
}

export function googleNativeAuthReady(env: GoogleNativeAuthEnvironment = {}): boolean {
  return Boolean((env.webClientId ?? GOOGLE_WEB_CLIENT_ID).trim());
}

export function googleNativeAuthUnavailableReason(
  env: GoogleNativeAuthEnvironment = {},
): string | null {
  return googleNativeAuthReady(env)
    ? null
    : "Google Sign-In is not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.";
}

export function googleNativeAuthConfig(env: GoogleNativeAuthEnvironment = {}) {
  const webClientId = (env.webClientId ?? GOOGLE_WEB_CLIENT_ID).trim();
  return {
    webClientId,
    offlineAccess: false,
  };
}

export function googleNativeSignInButtonMode({
  platform,
  webClientId,
  isExpoGo = false,
  nativeAndroidAuthEnabled = GOOGLE_NATIVE_ANDROID_AUTH_ENABLED,
}: GoogleNativeAuthEnvironment & {
  platform: GoogleNativePlatform;
  isExpoGo?: boolean;
}): GoogleNativeSignInMode {
  if (isExpoGo) return "oauth";
  if (platform !== "android" || !nativeAndroidAuthEnabled) return "oauth";
  return googleNativeAuthReady({ webClientId }) ? "native" : "oauth";
}

export function getGoogleNativeIdToken(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const root = response as { idToken?: unknown; data?: { idToken?: unknown } };
  if (typeof root.data?.idToken === "string" && root.data.idToken) return root.data.idToken;
  if (typeof root.idToken === "string" && root.idToken) return root.idToken;
  return null;
}

export function isGoogleNativeCancellationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: unknown }).code ?? "").toLowerCase();
  return code === "sign_in_cancelled" || code === "cancelled";
}

export function isGoogleNativeDeveloperError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: unknown }).code ?? "").toLowerCase();
  const message = String((error as { message?: unknown }).message ?? "").toLowerCase();
  return (
    code === "developer_error" ||
    code === "10" ||
    message.includes("developer_error") ||
    message.includes("developer error") ||
    message.includes("developer console is not set up correctly")
  );
}

export function googleNativeDeveloperErrorMessage(): string {
  return [
    "Google native sign-in is not configured for this Android build.",
    "Add an Android OAuth client for package health.lagan.app with this build's SHA-1 fingerprint,",
    "or leave EXPO_PUBLIC_GOOGLE_NATIVE_ANDROID_AUTH unset to use browser OAuth.",
  ].join(" ");
}
