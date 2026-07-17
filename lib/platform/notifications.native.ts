import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Category for single-habit reminders: adds a "Mark done" button that logs
// the habit without foregrounding the app. Bundled reminders stay uncategorized
// (no bulk-complete button) and keep plain tap-to-open behavior.
export const HABIT_REMINDER_CATEGORY = "habit-reminder";
export const COMPLETE_ACTION_ID = "complete";

export async function registerNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(HABIT_REMINDER_CATEGORY, [
    {
      identifier: COMPLETE_ACTION_ID,
      buttonTitle: "Mark done",
      options: { opensAppToForeground: false },
    },
  ]).catch(() => {});
}

export async function requestPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function getPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  const { status } = await Notifications.getPermissionsAsync();
  return status as "granted" | "denied" | "undetermined";
}

// Schedules a single weekly notification on one weekday (0-6, Sun-Sat) at the
// given HH:MM. Callers supply the title/body/data so a single notification can
// represent either one habit or a bundle of habits sharing the same time.
export async function scheduleWeeklyReminder(
  weekday: number,
  time: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  categoryIdentifier?: string,
): Promise<string> {
  const [hour, minute] = time.split(":").map(Number);
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data, ...(categoryIdentifier ? { categoryIdentifier } : {}) },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: weekday === 0 ? 1 : weekday + 1,
      hour,
      minute,
    },
  });
}

// Schedules a single one-off notification at an absolute date/time.
export async function scheduleDateReminder(
  fireAt: Date,
  title: string,
  body: string,
  data: Record<string, unknown>,
  categoryIdentifier?: string,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data, ...(categoryIdentifier ? { categoryIdentifier } : {}) },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function cancelScheduledReminder(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

// App-icon badge, managed as a semantic "remaining habits today" count. Kept
// separate from delivered notifications (the handler sets shouldSetBadge:false)
// so incoming reminders never double-count. No-ops silently if the user hasn't
// granted the badge permission; Android numeric badges are launcher-dependent.
export async function setAppBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
  } catch {
    // Badge is best-effort; never surface to callers.
  }
}

export async function getAppBadgeCount(): Promise<number> {
  try {
    return await Notifications.getBadgeCountAsync();
  } catch {
    return 0;
  }
}

export async function clearAppBadge(): Promise<void> {
  await setAppBadgeCount(0);
}
