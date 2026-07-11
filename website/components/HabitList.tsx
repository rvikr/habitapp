"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { createHabit, toggleHabit } from "@/app/(app)/dashboard/actions";
import { localDateKey } from "@/lib/date";
import { formatCheckInAmount, habitCheckInActionLabel } from "@/lib/habit-progress";
import {
  operationForCompletionSubmission,
  type CompletionSubmissionOperation,
} from "@/lib/completion-submission-operation";
import type { Habit } from "@/types/db";

const COLOR_MAP: Record<string, { bg: string; ic: string }> = {
  primary: { bg: "bg-primary-fixed", ic: "text-primary" },
  secondary: { bg: "bg-secondary-container", ic: "text-secondary" },
  tertiary: { bg: "bg-tertiary-fixed", ic: "text-on-tertiary-container" },
  neutral: { bg: "bg-surface-container-high", ic: "text-on-surface-variant" },
};

const ICON_OPTIONS = [
  "water_drop",
  "directions_walk",
  "directions_run",
  "menu_book",
  "self_improvement",
  "edit_note",
  "fitness_center",
  "bedtime",
  "restaurant",
  "code",
  "spa",
];

const COLOR_OPTIONS = [
  { id: "primary", label: "Ember", className: "bg-primary" },
  { id: "secondary", label: "Sage", className: "bg-secondary" },
  { id: "tertiary", label: "Amber", className: "bg-tertiary" },
  { id: "neutral", label: "Neutral", className: "bg-surface-container-highest" },
];

function HabitCreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [icon, setIcon] = useState("spa");
  const [color, setColor] = useState("primary");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);

    try {
      const result = await createHabit(formData);
      if (!result.ok) {
        setError(result.error ?? "Could not add habit.");
        return;
      }

      formRef.current?.reset();
      setIcon("spa");
      setColor("primary");
      onCreated();
    } catch {
      setError("Could not add habit.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-outline-variant bg-surface p-4 shadow-card"
    >
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="color" value={color} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="block text-sm font-bold text-on-background">Habit name</span>
          <input
            name="name"
            required
            maxLength={80}
            placeholder="Morning walk"
            className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-medium text-on-background placeholder:text-outline transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </label>

        <label className="space-y-1.5">
          <span className="block text-sm font-bold text-on-background">Target</span>
          <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">
            <input
              name="target"
              type="number"
              min="0"
              step="any"
              placeholder="20"
              className="min-w-0 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-medium text-on-background placeholder:text-outline transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
            <input
              name="unit"
              maxLength={24}
              placeholder="min"
              className="min-w-0 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-3 text-sm font-medium text-on-background placeholder:text-outline transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </label>
      </div>

      <label className="space-y-1.5">
        <span className="block text-sm font-bold text-on-background">Description</span>
        <input
          name="description"
          maxLength={180}
          placeholder="Optional note"
          className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm font-medium text-on-background placeholder:text-outline transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </label>

      <div className="space-y-2">
        <p className="text-sm font-bold text-on-background">Icon</p>
        <div className="flex flex-wrap gap-2">
          {ICON_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setIcon(item)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                icon === item
                  ? "border-primary bg-primary text-white"
                  : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-primary"
              }`}
              aria-label={`Use ${item} icon`}
              aria-pressed={icon === item}
            >
              <span className="material-symbols-outlined text-[20px]">{item}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold text-on-background">Color</p>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setColor(item.id)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                color === item.id ? "border-primary ring-2 ring-primary/20" : "border-outline-variant"
              }`}
              aria-label={`Use ${item.label} color`}
              aria-pressed={color === item.id}
            >
              <span className={`h-5 w-5 rounded-full ${item.className}`} />
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-outline-variant px-4 py-2 text-sm font-bold text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          {pending ? "Adding..." : "Add habit"}
        </button>
      </div>
    </form>
  );
}

function HabitRow({
  habit,
  done,
  currentValue,
}: {
  habit: Habit;
  done: boolean;
  currentValue: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const operationRef = useRef<CompletionSubmissionOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { bg, ic } = COLOR_MAP[habit.color] ?? COLOR_MAP.neutral;
  const actionLabel = habitCheckInActionLabel(habit, currentValue, done);

  async function toggle() {
    if (pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    setError(null);
    const operation = operationForCompletionSubmission(
      operationRef.current,
      { habitId: habit.id, value: currentValue, note: done ? "remove" : "web-check-in" },
      () => crypto.randomUUID(),
    );
    operationRef.current = operation;
    try {
      const result = await toggleHabit(habit.id, done, localDateKey(), operation.id);
      if (!result.ok) {
        setError(result.error ?? "Could not update habit.");
        return;
      }
      operationRef.current = null;
      router.refresh();
    } catch {
      setError("Could not update habit.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={actionLabel}
        className={`flex w-full items-center gap-4 rounded-2xl border border-outline-variant bg-surface p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container-high disabled:cursor-wait ${
          pending ? "opacity-70" : ""
        }`}
      >
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
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-all ${
            done
              ? "bg-secondary text-white shadow-[0_4px_12px_rgba(62,187,127,0.3)]"
              : "border-2 border-outline-variant"
          }`}
          aria-hidden="true"
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
      </button>

      {error && (
        <p role="alert" className="px-2 text-sm font-semibold text-error">
          {error}
        </p>
      )}
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
  const router = useRouter();
  const [showForm, setShowForm] = useState(habits.length === 0);

  function created() {
    setShowForm(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add habit
          </button>
        )}
      </div>

      {showForm && <HabitCreateForm onCancel={() => setShowForm(false)} onCreated={created} />}

      {habits.length === 0 && !showForm && (
        <div className="rounded-2xl border border-outline-variant/15 bg-surface p-8 text-center shadow-card">
          <span
            className="material-symbols-outlined mb-3 block text-5xl text-outline"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            add_circle
          </span>
          <p className="text-lg font-bold text-on-background">No habits yet</p>
          <p className="mt-1 text-sm text-on-surface-variant">Create your first habit.</p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add habit
          </button>
        </div>
      )}

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
