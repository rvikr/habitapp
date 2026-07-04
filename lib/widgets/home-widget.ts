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
  | "nextHabitName"
  | "coachMessage"
  | "hasPro"
>;

const SIGNED_OUT_HOME_WIDGET_SNAPSHOT = JSON.stringify({
  title: "Today",
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
