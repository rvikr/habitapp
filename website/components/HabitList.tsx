import { formatCheckInAmount } from "@/lib/habit-progress";
import { PLAY_STORE_URL } from "@/lib/site";
import type { Habit } from "@/types/db";

/**
 * Read-only habit list for the web dashboard. Adding and logging habits happen in
 * the Lagan app — on the web these rows are a progress view only.
 */

const COLOR_MAP: Record<string, { bg: string; ic: string }> = {
  primary: { bg: "bg-primary-fixed", ic: "text-primary" },
  secondary: { bg: "bg-secondary-container", ic: "text-secondary" },
  tertiary: { bg: "bg-tertiary-fixed", ic: "text-on-tertiary-container" },
  neutral: { bg: "bg-surface-container-high", ic: "text-on-surface-variant" },
};

function HabitRow({
  habit,
  done,
  currentValue,
}: {
  habit: Habit;
  done: boolean;
  currentValue: number;
}) {
  const { bg, ic } = COLOR_MAP[habit.color] ?? COLOR_MAP.neutral;

  return (
    <div className="flex w-full items-center gap-4 rounded-2xl border border-outline-variant bg-surface p-4 text-left">
      <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${bg}`}>
        <span
          className={`material-symbols-outlined text-2xl ${ic}`}
          style={done ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          {habit.icon}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={`text-base font-bold ${
              done ? "text-on-surface-variant line-through" : "text-on-background"
            }`}
          >
            {habit.name}
          </span>
          {habit.target != null && Number(habit.target) > 0 && (
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs font-bold text-on-surface-variant">
              {formatCheckInAmount(currentValue)} / {formatCheckInAmount(Number(habit.target))}
              {habit.unit ? ` ${habit.unit}` : ""}
            </span>
          )}
        </span>
        {habit.description && (
          <span className="mt-0.5 block truncate text-sm text-on-surface-variant">
            {habit.description}
          </span>
        )}
      </span>

      <span
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
          done
            ? "bg-secondary text-white shadow-[0_4px_12px_rgba(62,187,127,0.3)]"
            : "border-2 border-outline-variant"
        }`}
        aria-label={done ? "Completed today" : "Not completed today"}
      >
        {done && (
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check
          </span>
        )}
      </span>
    </div>
  );
}

export default function HabitList({
  habits,
  completedToday,
  todayValues,
}: {
  habits: Habit[];
  completedToday: Set<string>;
  todayValues: Record<string, number>;
}) {
  if (habits.length === 0) {
    return (
      <div className="rounded-2xl border border-outline-variant/15 bg-surface p-8 text-center shadow-card">
        <span
          className="material-symbols-outlined mb-3 block text-5xl text-outline"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          smartphone
        </span>
        <p className="text-lg font-bold text-on-background">No habits yet</p>
        <p className="mt-1 text-sm text-on-surface-variant">
          Add and log your habits in the Lagan app. Your progress shows up here.
        </p>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          <span className="material-symbols-outlined text-[18px]">android</span>
          Get the Android app
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {habits.map((habit) => (
        <HabitRow
          key={habit.id}
          habit={habit}
          done={completedToday.has(habit.id)}
          currentValue={todayValues[habit.id] ?? 0}
        />
      ))}
    </div>
  );
}
