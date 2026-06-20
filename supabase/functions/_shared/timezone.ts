const FALLBACK_TIMEZONE = "UTC";

export function normalizeTimeZone(timezone: string | null | undefined): string {
  const candidate = typeof timezone === "string" ? timezone.trim() : "";
  if (!candidate) return FALLBACK_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}
