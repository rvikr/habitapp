type ExportRow = Record<string, unknown>;

type BuildDataExportInput = {
  exportedAt?: string;
  user: { id: string; email: string | null };
  profile: ExportRow | null;
  habits?: ExportRow[] | null;
  completions?: ExportRow[] | null;
  sleepEntries?: ExportRow[] | null;
  feedback?: ExportRow[] | null;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function compareAsc(a: string, b: string): number {
  return a.localeCompare(b);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => compareAsc(a, b))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`);
  return `{${entries.join(",")}}`;
}

function compareRowsByIdThenContent(a: ExportRow, b: ExportRow): number {
  const id = compareAsc(stringValue(a.id), stringValue(b.id));
  return id !== 0 ? id : compareAsc(canonicalJson(a), canonicalJson(b));
}

function sortHabits(rows: ExportRow[]): ExportRow[] {
  return [...rows].sort((a, b) => {
    const created = compareAsc(stringValue(a.created_at), stringValue(b.created_at));
    return created !== 0 ? created : compareRowsByIdThenContent(a, b);
  });
}

function sortCompletions(rows: ExportRow[]): ExportRow[] {
  return [...rows].sort((a, b) => {
    const completedOn = stringValue(b.completed_on).localeCompare(stringValue(a.completed_on));
    if (completedOn !== 0) return completedOn;
    const created = stringValue(b.created_at).localeCompare(stringValue(a.created_at));
    return created !== 0 ? created : compareRowsByIdThenContent(a, b);
  });
}

function sortByDateDesc(rows: ExportRow[], key: string): ExportRow[] {
  return [...rows].sort((a, b) => {
    const date = stringValue(b[key]).localeCompare(stringValue(a[key]));
    return date !== 0 ? date : compareRowsByIdThenContent(a, b);
  });
}

function duplicateCompletionPeriods(completions: ExportRow[]) {
  const periods = new Map<
    string,
    { habit_id: string; completed_on: string; completion_ids: string[] }
  >();

  for (const completion of completions) {
    const habitId = stringValue(completion.habit_id);
    const completedOn = stringValue(completion.completed_on);
    if (!habitId || !completedOn) continue;
    const key = `${habitId}\u0000${completedOn}`;
    const period = periods.get(key) ?? {
      habit_id: habitId,
      completed_on: completedOn,
      completion_ids: [],
    };
    period.completion_ids.push(stringValue(completion.id));
    periods.set(key, period);
  }

  return [...periods.values()]
    .filter((period) => period.completion_ids.length > 1)
    .map((period) => ({
      ...period,
      completion_ids: [...period.completion_ids].sort(compareAsc),
    }))
    .sort((a, b) => {
      const habit = compareAsc(a.habit_id, b.habit_id);
      return habit !== 0 ? habit : b.completed_on.localeCompare(a.completed_on);
    });
}

function orphanCompletionIds(habits: ExportRow[], completions: ExportRow[]): string[] {
  const habitIds = new Set(habits.map((habit) => stringValue(habit.id)).filter(Boolean));
  return completions
    .filter((completion) => !habitIds.has(stringValue(completion.habit_id)))
    .map((completion) => stringValue(completion.id))
    .filter(Boolean)
    .sort(compareAsc);
}

export function buildDataExport(input: BuildDataExportInput) {
  const habits = sortHabits(input.habits ?? []);
  const completions = sortCompletions(input.completions ?? []);
  const sleepEntries = sortByDateDesc(input.sleepEntries ?? [], "sleep_date");
  const feedback = sortByDateDesc(input.feedback ?? [], "created_at");

  return {
    schema_version: 1,
    exported_at: input.exportedAt ?? new Date().toISOString(),
    user: input.user,
    profile: input.profile ?? null,
    habits,
    completions,
    sleep_entries: sleepEntries,
    feedback,
    integrity: {
      counts: {
        profile: input.profile ? 1 : 0,
        habits: habits.length,
        completions: completions.length,
        sleep_entries: sleepEntries.length,
        feedback: feedback.length,
      },
      duplicate_completion_periods: duplicateCompletionPeriods(completions),
      orphan_completion_ids: orphanCompletionIds(habits, completions),
    },
  };
}
