export const AUTH_CALLBACK_PATH = "auth/callback";

// Pure + dependency-free so it can be unit tested under the node test runner.
// On web, `Linking.createURL` resolves the callback path against
// `window.location.origin`, which omits the Expo Router base path ("/app") and
// sends the OAuth redirect to the marketing site's callback instead of the PWA.
// Reapply the base path the same way expo-router does (prefixed only outside
// development, so localhost web dev stays at root).
export function buildWebAuthCallbackUrl(
  origin: string,
  baseUrl: string | undefined = process.env.EXPO_BASE_URL,
  isDevelopment: boolean = process.env.NODE_ENV === "development",
): string {
  const base =
    !isDevelopment && baseUrl ? `/${baseUrl.replace(/^\/+/, "").replace(/\/+$/, "")}` : "";
  return new URL(`${base}/${AUTH_CALLBACK_PATH}`, origin).toString();
}
