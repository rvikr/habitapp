// Type stub — Metro picks `notifications.native.ts` or `notifications.web.ts` at bundle time.
export declare function requestPermission(): Promise<boolean>;
export declare function getPermissionStatus(): Promise<"granted" | "denied" | "undetermined">;
export declare function scheduleHabitReminder(
  habitId: string,
  habitName: string,
  time: string,
  days: number[],
  body?: string,
): Promise<string[]>;
export declare function scheduleHabitReminderAt(
  habitId: string,
  habitName: string,
  fireAt: Date,
  body?: string,
): Promise<string>;
export declare function cancelScheduledReminder(id: string): Promise<void>;
export declare function cancelAllReminders(): Promise<void>;
