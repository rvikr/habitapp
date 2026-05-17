export async function requestPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export async function getPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  if (typeof Notification === "undefined") return "undetermined";
  return Notification.permission as "granted" | "denied" | "undetermined";
}

export async function scheduleHabitReminder(
  _habitId: string,
  _habitName: string,
  _time: string,
  _days: number[],
  _body?: string,
): Promise<string[]> {
  return [];
}

export async function scheduleHabitReminderAt(
  _habitId: string,
  _habitName: string,
  _fireAt: Date,
  _body?: string,
): Promise<string> {
  return "";
}

export async function cancelScheduledReminder(_id: string): Promise<void> {}

export async function cancelAllReminders(): Promise<void> {}
