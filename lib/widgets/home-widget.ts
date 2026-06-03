import { updateHomeWidgetSnapshot } from "@/lib/platform/home-widget";

import {
  buildHomeWidgetSnapshot,
  stringifyHomeWidgetSnapshot,
  type HomeWidgetSnapshotInput,
} from "./home-widget-snapshot";

export type HomeWidgetDashboardSnapshot = Pick<
  HomeWidgetSnapshotInput,
  "completedCount" | "totalHabits" | "currentStreak" | "level" | "nextHabit" | "locale"
>;

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
