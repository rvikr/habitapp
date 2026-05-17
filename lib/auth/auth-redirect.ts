import * as Linking from "expo-linking";

export const AUTH_CALLBACK_PATH = "auth/callback";

export function authCallbackUrl() {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

export type ParsedAuthCallback = {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  type: string | null;
  error: string | null;
  errorDescription: string | null;
};

export function parseAuthCallbackUrl(url: string): ParsedAuthCallback {
  const parsed = Linking.parse(url);
  const queryParams = parsed.queryParams ?? {};
  const hashParams = parseHashParams(url);
  const allParams = { ...queryParams, ...hashParams };

  return {
    code: firstParam(allParams.code),
    accessToken: firstParam(allParams.access_token),
    refreshToken: firstParam(allParams.refresh_token),
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
