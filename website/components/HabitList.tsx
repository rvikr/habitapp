"use client";

import { useTransition } from "react";
import { toggleHabit } from "@/app/(app)/dashboard/actions";
import { localDateKey } from "@/lib/date";
import type { Habit } from "@/types/db";

const COLOR_MAP: Record<string, { bg: string; ic: string }> = {
  primary:   { bg: "bg-primary-fixed",        ic: "text-primary" },
  secondary: { bg: "bg-secondary-container",  ic: "text-secondary" },
  tertiary:  { bg: "bg-tertiary-fixed",       ic: "text-on-tertiary-container" },
  neutral:   { bg: "bg-surface-container-high", ic: "text-on-surface-variant" },
};

function HabitRow({
  habit,
  done,
}: {
  habit: Habit;
  done: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const { bg, ic } = COLOR_MAP[habit.color] ?? COLOR_MAP.neutral;

  function toggle() {
    startTransition(() => toggleHabit(habit.id, done, localDateKey()));
  }

  return (
    <div
      className={`bg-surface rounded-2xl p-4 flex items-center gap-4 border border-outline-variant hover:bg-surface-container-high hover:-translate-y-0.5 transition-all duration-200 ${
        pending ? "opacity-70" : ""
      }`}
    >
      <div className={`w-12 h-12 ${bg} rounded-2xl flex items-center justify-center flex-shrink-0`}>
        <span
          className={`material-symbols-outlined ${ic} text-2xl`}
          style={done ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          {habit.icon}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={`font-bold text-base ${done ? "text-on-surface-variant line-through" : "text-on-background"}`}>
            {habit.name}
          </h3>
          {habit.target && habit.unit && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
              {habit.target} {habit.unit}
            </span>
          )}
        </div>
        {habit.description && (
          <p className="text-sm text-on-surface-variant mt-0.5 truncate">{habit.description}</p>
        )}
      </div>

      <button
        onClick={toggle}
        disabled={pending}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 ${
          done
            ? "bg-secondary text-white shadow-[0_4px_12px_rgba(0,106,103,0.3)]"
            : "border-2 border-outline-variant hover:border-primary"
        }`}
        aria-label={done ? "Mark incomplete" : "Mark complete"}
      >
        {done && (
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            check
          </span>
        )}
      </button>
    </div>
  );
}

export default function HabitList({
  habits,
  completedToday,
}: {
  habits: Habit[];
  completedToday: Set<string>;
}) {
  if (habits.length === 0) {
    return (
      <div className="bg-surface rounded-2xl p-8 text-center border border-outline-variant/15 shadow-card">
        <span className="material-symbols-outlined text-5xl text-outline mb-3 block" style={{ fontVariationSettings: "'FILL' 1" }}>
          add_circle
        </span>
        <p className="font-bold text-on-background text-lg">No habits yet</p>
        <p className="text-on-surface-variant text-sm mt-1">Open the mobile app to add your first habit.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {habits.map((habit) => (
        <HabitRow key={habit.id} habit={habit} done={completedToday.has(habit.id)} />
      ))}
    </div>
  );
}
