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

export const supabase = _createClient(
  isSupabaseConfigured() ? SUPABASE_URL : FALLBACK_SUPABASE_URL,
  isSupabaseConfigured() ? SUPABASE_ANON_KEY : FALLBACK_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: secureStorage,
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
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
