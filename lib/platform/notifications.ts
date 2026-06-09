// Type stub — Metro picks `notifications.native.ts` or `notifications.web.ts` at bundle time.
export declare function requestPermission(): Promise<boolean>;
export declare function getPermissionStatus(): Promise<"granted" | "denied" | "undetermined">;
export declare function scheduleWeeklyReminder(
  weekday: number,
  time: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<string>;
export declare function scheduleDateReminder(
  fireAt: Date,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<string>;
export declare function cancelScheduledReminder(id: string): Promise<void>;
export declare function cancelAllReminders(): Promise<void>;
