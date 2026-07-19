export type AuthCallbackCredentialParse = {
  code: string | null;
  tokenHash: string | null;
  error: string | null;
};

// Chooses which candidate launch URL the callback screen should act on. The app
// can observe several at once — Linking.useURL(), Linking.getInitialURL(), the
// browser location, and the route's own params — and after an App Link /
// Universal Link opens the app at /auth/confirm, the FIRST non-null candidate is
// not necessarily the one carrying the credential (e.g. useURL() may resolve to
// a tokenless in-app URL while getInitialURL() still holds the original email
// link with the token_hash). So prefer whichever candidate actually parses to a
// code or token_hash; otherwise fall back to an error-bearing URL so an expired
// link still reports "expired" rather than "missing token"; otherwise the first
// candidate, for a coherent generic message.
//
// Pure + dependency-free (the parser is injected) so it runs under the node test
// runner; the wired call in app/auth/callback.tsx passes parseAuthCallbackUrl.
export function pickAuthCallbackUrl(
  urls: readonly (string | null | undefined)[],
  parse: (url: string) => AuthCallbackCredentialParse,
): string | null {
  const candidates = urls.filter((url): url is string => typeof url === "string" && url.length > 0);
  const credentialed = candidates.find((url) => {
    const parsed = parse(url);
    return Boolean(parsed.code || parsed.tokenHash);
  });
  if (credentialed) return credentialed;
  const errored = candidates.find((url) => Boolean(parse(url).error));
  return errored ?? candidates[0] ?? null;
}
