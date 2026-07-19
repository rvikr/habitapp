import "../platform/webcrypto-polyfill";
import { createClient as _createClient, type Session, type User } from "@supabase/supabase-js";
import { createAuthCodeExchanger } from "../auth/auth-code-exchange";
import { secureStorage } from "../platform/secure-storage";
import { isMissingRefreshTokenError } from "./auth-error";
import { classifyStoredSession } from "./session-storage";
import { reportError } from "../services/sentry";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const FALLBACK_SUPABASE_URL = "https://not-configured.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "not-configured";
const SUPABASE_AUTH_STORAGE_KEY = `sb-${projectRefFromUrl(
  isSupabaseConfigured() ? SUPABASE_URL : FALLBACK_SUPABASE_URL,
)}-auth-token`;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function projectRefFromUrl(url: string): string {
  try {
    return new URL(url).hostname.split(".")[0] || "default";
  } catch {
    return "default";
  }
}

// Drop a persisted session only when it parses cleanly but has no refresh token
// (see classifyStoredSession). An unparseable read is left intact so a transient
// glitch can't trigger a permanent sign-out.
const authStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await secureStorage.getItem(key);
    if (value && key === SUPABASE_AUTH_STORAGE_KEY) {
      const verdict = classifyStoredSession(value);
      if (verdict === "missing-refresh-token") {
        try {
          await secureStorage.removeItem(key);
        } catch {
          // Best effort — returning null still gets the client to a clean state.
        }
        return null;
      }
      // "unparseable" → leave storage intact and hand the value to supabase-js,
      // which rejects bad JSON without us destroying a recoverable session.
    }
    return value;
  },
  setItem(key: string, value: string): Promise<void> {
    return secureStorage.setItem(key, value);
  },
  removeItem(key: string): Promise<void> {
    return secureStorage.removeItem(key);
  },
};

// React Native has no `navigator.locks`, so auth-js falls back to a no-op lock
// and does NOT serialize concurrent auth operations (getUser / refresh / the
// storage writes they trigger). Concurrent callers — e.g. a batch of habit
// creates — could then interleave reads and writes of the chunked session and
// corrupt it. This per-name promise chain mirrors auth-js's own `processLock`
// (minus the acquire timeout) and serializes them within the JS runtime.
const lockChains: Record<string, Promise<unknown>> = {};

async function processLock<R>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  const previous = lockChains[name] ?? Promise.resolve();
  const run = (async () => {
    try {
      await previous;
    } catch {
      // A previous holder's failure must not block the queue.
    }
    return fn();
  })();
  lockChains[name] = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export const supabase = _createClient(
  isSupabaseConfigured() ? SUPABASE_URL : FALLBACK_SUPABASE_URL,
  isSupabaseConfigured() ? SUPABASE_ANON_KEY : FALLBACK_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: authStorage,
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      lock: processLock,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  },
);

// Shared by the OAuth return path in lib/data/actions.ts and the /auth/callback
// screen, which can both receive the same native redirect; see the factory for
// why the exchange must be deduplicated per code.
export const exchangeAuthCode = createAuthCodeExchanger((code: string) =>
  supabase.auth.exchangeCodeForSession(code),
);

export function configurationError() {
  return {
    message:
      "Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY before signing in.",
  };
}

export { isMissingRefreshTokenError };

// Used by AuthGuard to distinguish a user-initiated sign-out (no notice)
// from a forced sign-out due to a stale/invalid refresh token (show notice).
let signOutWasUserInitiated = false;

export function markUserInitiatedSignOut(): void {
  signOutWasUserInitiated = true;
}

export function consumeSignOutWasUserInitiated(): boolean {
  const value = signOutWasUserInitiated;
  signOutWasUserInitiated = false;
  return value;
}

export async function clearLocalAuthSession(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The storage removal below is the important fallback for stale tokens.
  }

  try {
    await secureStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
  } catch {
    // Best effort only; callers should still treat the user as signed out.
  }
}

// A genuine "no session" is a normal signed-out state, not a fault worth
// reporting. Everything else (network failures, unexpected auth errors) is
// captured so a misleading "sign in again" can be traced to its real cause.
function isExpectedSignedOutError(error: unknown): boolean {
  if (isMissingRefreshTokenError(error)) return true;
  const record = error as { name?: string; message?: string } | null;
  const text = `${record?.name ?? ""} ${record?.message ?? ""}`.toLowerCase();
  return text.includes("auth session missing") || text.includes("session missing");
}

function reportAuthFault(source: string, error: unknown): void {
  if (isExpectedSignedOutError(error)) return;
  const record = error as { name?: string; status?: unknown; code?: unknown } | null;
  const normalized = error instanceof Error ? error : new Error(String(error));
  reportError(normalized, {
    source,
    name: record?.name,
    status: record?.status,
    code: record?.code,
  });
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (isMissingRefreshTokenError(error)) await clearLocalAuthSession();
      else reportAuthFault("getCurrentSession", error);
      return null;
    }
    return data.session;
  } catch (error) {
    if (isMissingRefreshTokenError(error)) await clearLocalAuthSession();
    else reportAuthFault("getCurrentSession:throw", error);
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isMissingRefreshTokenError(error)) await clearLocalAuthSession();
      else reportAuthFault("getCurrentUser", error);
      return null;
    }
    return data.user;
  } catch (error) {
    if (isMissingRefreshTokenError(error)) await clearLocalAuthSession();
    else reportAuthFault("getCurrentUser:throw", error);
    return null;
  }
}
