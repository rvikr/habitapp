// A PKCE auth code is single-use: the first exchangeCodeForSession call consumes
// the stored code verifier, so a second exchange of the same code always fails.
// On native Android the OAuth redirect is delivered twice — once resolving
// WebBrowser.openAuthSessionAsync (lib/data/actions.ts) and once through
// expo-router's deep-link navigation, which mounts /auth/callback — and both
// paths exchange the code. Deduplicating by code lets the second caller share
// the first caller's result instead of surfacing a bogus error screen after an
// already-successful sign-in. Failed results are shared too: a consumed or
// broken code can't succeed on retry, and a fresh attempt mints a fresh code.
// Pure + dependency-free so it can be unit tested under the node test runner;
// the wired instance lives in lib/supabase/client.ts.
export function createAuthCodeExchanger<Result>(
  exchange: (code: string) => Promise<Result>,
): (code: string) => Promise<Result> {
  const exchanges = new Map<string, Promise<Result>>();
  return (code) => {
    const pending = exchanges.get(code);
    if (pending) return pending;
    const started = exchange(code);
    exchanges.set(code, started);
    return started;
  };
}
