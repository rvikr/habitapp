// Type stub — Metro picks `notifications.native.ts` or `notifications.web.ts` at bundle time.
export declare const HABIT_REMINDER_CATEGORY: string;
export declare const COMPLETE_ACTION_ID: string;
export declare function registerNotificationCategories(): Promise<void>;
export declare function requestPermission(): Promise<boolean>;
export declare function getPermissionStatus(): Promise<"granted" | "denied" | "undetermined">;
export declare function scheduleWeeklyReminder(
  weekday: number,
  time: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  categoryIdentifier?: string,
): Promise<string>;
export declare function scheduleDateReminder(
  fireAt: Date,
  title: string,
  body: string,
  data: Record<string, unknown>,
  categoryIdentifier?: string,
): Promise<string>;
export declare function cancelScheduledReminder(id: string): Promise<void>;
export declare function cancelAllReminders(): Promise<void>;
