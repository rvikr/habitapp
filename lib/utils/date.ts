export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDateDaysAgo(days: number, from = new Date()): string {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return localDateKey(date);
}

export function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Monday of the current local calendar week — the app-wide week convention
// (same (day + 6) % 7 math as weekProgressFor() and the progress tab).
export function currentWeekStartKey(reference = new Date()): string {
  const monday = new Date(reference);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDateKey(monday);
}

// Mirrors previousWeekStart() in supabase/functions/progress-report/index.ts:
// weekly progress reports always cover the previous Monday-based (ISO) UTC week,
// so both sides must compute the same week_start for staleness checks to hold.
export function previousUtcWeekStartKey(reference = new Date()): string {
  const utc = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()),
  );
  const offsetToMonday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - offsetToMonday - 7);
  return utc.toISOString().slice(0, 10);
}
