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
): Promise<string> {
  const [hour, minute] = time.split(":").map(Number);
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data },
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
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data },
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
