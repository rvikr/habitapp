import type { Platform } from "react-native";

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

export type GoogleNativeAuthEnvironment = {
  webClientId?: string | null;
};

export type GoogleNativePlatform = typeof Platform.OS;

export type GoogleNativeSignInMode = "native" | "oauth";

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
}: GoogleNativeAuthEnvironment & {
  platform: GoogleNativePlatform;
  isExpoGo?: boolean;
}): GoogleNativeSignInMode {
  if (isExpoGo) return "oauth";
  return platform === "android" && googleNativeAuthReady({ webClientId }) ? "native" : "oauth";
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
