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

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function addDateKeyDays(value: string, days: number): string {
  if (!isValidDateKey(value)) throw new Error("Invalid date key");
  const [year, month, day] = value.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + days));
}

export function dayIndexForDateKey(value: string): number {
  if (!isValidDateKey(value)) throw new Error("Invalid date key");
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
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
