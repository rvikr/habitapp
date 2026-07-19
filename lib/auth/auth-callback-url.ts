export const AUTH_CALLBACK_PATH = "auth/callback";
export const NATIVE_AUTH_CALLBACK_URL = "lagan://auth/callback";

// Pure + dependency-free so it can be unit tested under the node test runner.
// The deployed PWA lives below /app. Derive the callback from its explicit
// public URL rather than Expo's internal EXPO_BASE_URL build variable so the
// redirect contract is identical in local builds, Cloud Build, and production.
export function buildWebAuthCallbackUrl(
  origin: string,
  appUrl: string | undefined = process.env.EXPO_PUBLIC_APP_URL,
): string {
  const base = new URL(appUrl || origin, origin);
  const appPath = appUrl ? base.pathname.replace(/\/+$/, "") : "";
  base.pathname = `${appPath}/${AUTH_CALLBACK_PATH}`;
  base.search = "";
  base.hash = "";
  return base.toString();
}
