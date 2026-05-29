import "../platform/webcrypto-polyfill";
import { createClient as _createClient, type Session, type User } from "@supabase/supabase-js";
import { secureStorage } from "../platform/secure-storage";
import { isMissingRefreshTokenError } from "./auth-error";

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

// Supabase persists the session as JSON. If a stored payload is missing the
// refresh_token, supabase-js auto-refresh on startup throws
// "AuthApiError: Invalid Refresh Token: Refresh Token Not Found" and logs it
// before getSession() can catch it. Drop such payloads at the storage layer
// so the client boots cleanly as signed-out.
function hasUsableRefreshToken(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return false;
    const direct = parsed.refresh_token;
    if (typeof direct === "string" && direct.length > 0) return true;
    const nested = (parsed.currentSession as Record<string, unknown> | undefined)?.refresh_token;
    return typeof nested === "string" && nested.length > 0;
  } catch {
    return false;
  }
}

const authStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await secureStorage.getItem(key);
    if (value && key === SUPABASE_AUTH_STORAGE_KEY && !hasUsableRefreshToken(value)) {
      try {
        await secureStorage.removeItem(key);
      } catch {
        // Best effort — returning null still gets the client to a clean state.
      }
      return null;
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

export const supabase = _createClient(
  isSupabaseConfigured() ? SUPABASE_URL : FALLBACK_SUPABASE_URL,
  isSupabaseConfigured() ? SUPABASE_ANON_KEY : FALLBACK_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: authStorage,
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  },
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

export async function getCurrentSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (isMissingRefreshTokenError(error)) await clearLocalAuthSession();
      return null;
    }
    return data.session;
  } catch (error) {
    if (isMissingRefreshTokenError(error)) await clearLocalAuthSession();
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isMissingRefreshTokenError(error)) await clearLocalAuthSession();
      return null;
    }
    return data.user;
  } catch (error) {
    if (isMissingRefreshTokenError(error)) await clearLocalAuthSession();
    return null;
  }
}
