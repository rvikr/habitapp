import type { SleepDashboardData, SleepSyncResult } from "../data/sleep-data";
import type { SleepPermissionStatus } from "../data/sleep-shared";

export type { SleepDashboardData, SleepSyncResult, SleepPermissionStatus };

export declare function getSleepPermissionStatus(): Promise<SleepPermissionStatus>;
export declare function requestSleepPermission(): Promise<SleepPermissionStatus>;
export declare function syncLastNightSleep(options?: { requestPermission?: boolean }): Promise<{
  ok: boolean;
  data?: SleepSyncResult;
  error?: string;
  status?: SleepPermissionStatus;
}>;
export declare function getSleepDashboardData(options?: {
  force?: boolean;
}): Promise<SleepDashboardData>;
export declare function manualLogSleep(
  durationHours: number,
  sleepDate?: string,
): Promise<{ ok: boolean; data?: SleepSyncResult; error?: string }>;
