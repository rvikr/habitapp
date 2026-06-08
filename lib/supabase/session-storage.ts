// Classifies a raw persisted Supabase session payload so the storage layer can
// decide whether to drop it. Kept dependency-free so it can be unit-tested.
//
// A payload that parses cleanly but has no refresh_token must be dropped — on
// startup supabase-js would otherwise throw "Invalid Refresh Token: Refresh
// Token Not Found" before getSession() can catch it. But an UNPARSEABLE read is
// different: it can be a transient/corrupt read, and deleting on it would turn a
// glitch into a permanent sign-out, so it is reported separately and left alone.
export type StoredSessionVerdict = "usable" | "missing-refresh-token" | "unparseable";

export function classifyStoredSession(raw: string): StoredSessionVerdict {
  let parsed: Record<string, unknown> | null;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown> | null;
  } catch {
    return "unparseable";
  }
  if (!parsed || typeof parsed !== "object") return "unparseable";
  const direct = parsed.refresh_token;
  if (typeof direct === "string" && direct.length > 0) return "usable";
  const nested = (parsed.currentSession as Record<string, unknown> | undefined)?.refresh_token;
  if (typeof nested === "string" && nested.length > 0) return "usable";
  return "missing-refresh-token";
}
