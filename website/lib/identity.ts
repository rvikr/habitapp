// Mirrors lib/auth/identity.ts in the app workspace. Password accounts confirm
// deletion with their password; OAuth-only accounts (Google) have no password
// and confirm with a fresh provider sign-in. The delete-account edge function
// independently enforces the recent-sign-in window server-side.

// Mirrors the edge function's DELETE_ACCOUNT_REAUTH_MAX_AGE_SECONDS default.
export const REAUTH_MAX_AGE_MS = 10 * 60 * 1000;

type IdentityUser = {
  identities?: { provider?: string | null }[] | null;
  app_metadata?: { provider?: string | null; providers?: unknown } | null;
};

export function hasPasswordIdentity(user: IdentityUser | null | undefined): boolean {
  if (!user) return false;
  if (user.identities?.some((identity) => identity?.provider === "email")) return true;
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers) && providers.includes("email")) return true;
  return user.app_metadata?.provider === "email";
}

export function hasRecentSignIn(
  lastSignInAt: string | null | undefined,
  now: Date = new Date(),
  maxAgeMs: number = REAUTH_MAX_AGE_MS,
): boolean {
  if (!lastSignInAt) return false;
  const signedInAt = Date.parse(lastSignInAt);
  if (!Number.isFinite(signedInAt)) return false;
  return now.getTime() - signedInAt <= maxAgeMs;
}
