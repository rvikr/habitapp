import { Platform } from "react-native";
import * as Linking from "expo-linking";
import {
  AUTH_CALLBACK_PATH,
  NATIVE_AUTH_CALLBACK_URL,
  buildWebAuthCallbackUrl,
} from "./auth-callback-url";

export { AUTH_CALLBACK_PATH };

export function authCallbackUrl(queryParams?: Record<string, string>) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const url = new URL(buildWebAuthCallbackUrl(window.location.origin));
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) url.searchParams.set(key, value);
    }
    return url.toString();
  }
  const url = new URL(NATIVE_AUTH_CALLBACK_URL);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) url.searchParams.set(key, value);
  }
  return url.toString();
}

export type ParsedAuthCallback = {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  error: string | null;
  errorDescription: string | null;
};

export type AppEmailOtpType = "signup" | "recovery";

export function isAppEmailOtpType(value: string | null): value is AppEmailOtpType {
  return value === "signup" || value === "recovery";
}

export function parseAuthCallbackUrl(url: string): ParsedAuthCallback {
  const parsed = Linking.parse(url);
  const queryParams = parsed.queryParams ?? {};
  const hashParams = parseHashParams(url);
  const allParams = { ...queryParams, ...hashParams };

  return {
    code: firstParam(allParams.code),
    tokenHash: firstParam(allParams.token_hash),
    type: firstParam(allParams.type),
    error: firstParam(allParams.error),
    errorDescription: firstParam(allParams.error_description),
  };
}

function parseHashParams(url: string): Record<string, string> {
  const hashIndex = url.indexOf("#");
  if (hashIndex < 0) return {};
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function firstParam(value: unknown): string | null {
  if (Array.isArray(value)) return value[0] == null ? null : String(value[0]);
  return value == null ? null : String(value);
}
