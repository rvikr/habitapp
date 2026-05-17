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

export async function scheduleHabitReminder(
  habitId: string,
  habitName: string,
  time: string,
  days: number[],
  body?: string,
): Promise<string[]> {
  const [hour, minute] = time.split(":").map(Number);
  const ids: string[] = [];

  for (const day of days) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: habitName,
        body: body ?? habitName,
        data: { habitId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: day === 0 ? 1 : day + 1,
        hour,
        minute,
      },
    });
    ids.push(id);
  }
  return ids;
}

export async function scheduleHabitReminderAt(
  habitId: string,
  habitName: string,
  fireAt: Date,
  body?: string,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: habitName,
      body: body ?? habitName,
      data: { habitId },
    },
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
