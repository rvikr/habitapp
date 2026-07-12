import {
  clearHomeWidgetSnapshot as clearHomeWidgetSnapshotFromPlatform,
  updateHomeWidgetSnapshot,
} from "@/lib/platform/home-widget";

import {
  buildHomeWidgetSnapshot,
  stringifyHomeWidgetSnapshot,
  type HomeWidgetSnapshot,
  type HomeWidgetSnapshotInput,
} from "./home-widget-snapshot";

export type HomeWidgetDashboardSnapshot = Pick<
  HomeWidgetSnapshotInput,
  | "completedCount"
  | "totalHabits"
  | "currentStreak"
  | "level"
  | "locale"
  | "language"
  | "nextHabitName"
  | "nextHabit"
  | "coachMessage"
  | "weekTrend"
  | "upcomingHabits"
>;

// No todayKey on purpose: the signed-out card must never flip to the
// day-rollover ("stale") state, whatever day the launcher renders it on.
const SIGNED_OUT_HOME_WIDGET_SNAPSHOT = JSON.stringify({
  schemaVersion: 2,
  title: "Today",
  updatedAtMs: 0,
  completedCount: 0,
  totalHabits: 0,
  remainingCount: 0,
  progressPercent: 0,
  completionLabel: "Open Lagan to start",
  nextHabitLabel: "",
  coachLabel: "",
  streakLabel: "Sign in to sync",
  levelLabel: "Lagan",
  updatedLabel: "",
  checkInLabel: "Open Lagan",
  checkInUrl: null,
  trend: [],
  upcoming: [],
  staleLabels: {
    completionLabel: "New day — open Lagan",
    streakLabel: "Open Lagan to keep your streak",
    checkInLabel: "Open Lagan",
  },
} satisfies HomeWidgetSnapshot);

export async function syncHomeWidgetFromDashboard(
  input: HomeWidgetDashboardSnapshot,
): Promise<void> {
  const snapshot = buildHomeWidgetSnapshot(input);
  try {
    await updateHomeWidgetSnapshot(stringifyHomeWidgetSnapshot(snapshot));
  } catch {
    // Widget sync should never block the dashboard.
  }
}

export async function clearHomeWidgetSnapshot(): Promise<void> {
  try {
    await clearHomeWidgetSnapshotFromPlatform();
  } catch {
    try {
      await updateHomeWidgetSnapshot(SIGNED_OUT_HOME_WIDGET_SNAPSHOT);
    } catch {
      // Widget sync should never block auth state changes.
    }
  }
}
