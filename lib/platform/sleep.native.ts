import { Platform } from "react-native";
import Constants from "expo-constants";
import { isExpoGoRuntime } from "./runtime";
import {
  getSleepDashboardData,
  manualLogSleep,
  syncNormalizedSleepEntry,
  type SleepSyncResult,
} from "../data/sleep-data";
import {
  sleepLookbackWindows,
  sleepNoDataMessage,
  normalizeHealthConnectSleepSessions,
  normalizeHealthKitSleepSamples,
  type NormalizedSleepEntry,
  type SleepPermissionStatus,
  type SleepWindow,
} from "../data/sleep-shared";

export { getSleepDashboardData, manualLogSleep };

const HEALTH_CONNECT_SLEEP_PERMISSION = { accessType: "read", recordType: "SleepSession" } as const;
const HEALTHKIT_SLEEP_IDENTIFIER = "HKCategoryTypeIdentifierSleepAnalysis" as const;
const SLEEP_SYNC_LOOKBACK_DAYS = 7;

type HealthConnectModule = typeof import("react-native-health-connect");
type HealthKitModule = typeof import("@kingstinct/react-native-healthkit");
type SleepReadSnapshot = {
  status: SleepPermissionStatus;
  entry: NormalizedSleepEntry | null;
  checkedWindows?: SleepWindow[];
};

function isExpoGo(): boolean {
  return isExpoGoRuntime({
    appOwnership: Constants.appOwnership,
    executionEnvironment: Constants.executionEnvironment,
  });
}

async function loadHealthConnect(): Promise<HealthConnectModule | null> {
  if (Platform.OS !== "android" || isExpoGo()) return null;
  try {
    return await import("react-native-health-connect");
  } catch {
    return null;
  }
}

async function getHealthConnectStatus(
  mod?: HealthConnectModule | null,
): Promise<SleepPermissionStatus> {
  const healthConnect = mod ?? (await loadHealthConnect());
  if (!healthConnect) return "unavailable";

  try {
    const status = await healthConnect.getSdkStatus();
    if (status === healthConnect.SdkAvailabilityStatus.SDK_AVAILABLE) return "undetermined";
    if (status === healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return "providerUpdateRequired";
    }
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

async function initializeHealthConnect(): Promise<{
  mod: HealthConnectModule | null;
  status: SleepPermissionStatus;
}> {
  const mod = await loadHealthConnect();
  const status = await getHealthConnectStatus(mod);
  if (!mod || status !== "undetermined") return { mod, status };

  try {
    const initialized = await mod.initialize();
    return { mod, status: initialized ? "undetermined" : "unavailable" };
  } catch {
    return { mod, status: "unavailable" };
  }
}

function hasReadSleepPermission(
  permissions: { accessType?: string; recordType?: string }[],
): boolean {
  return permissions.some(
    (permission) => permission.accessType === "read" && permission.recordType === "SleepSession",
  );
}

async function getHealthConnectSleepPermissionStatus(): Promise<SleepPermissionStatus> {
  const { mod, status } = await initializeHealthConnect();
  if (!mod || status !== "undetermined") return status;

  try {
    const granted = await mod.getGrantedPermissions();
    return hasReadSleepPermission(granted) ? "granted" : "undetermined";
  } catch {
    return "undetermined";
  }
}

async function requestHealthConnectSleepPermission(): Promise<SleepPermissionStatus> {
  const { mod, status } = await initializeHealthConnect();
  if (!mod || status !== "undetermined") return status;

  try {
    const granted = await mod.requestPermission([HEALTH_CONNECT_SLEEP_PERMISSION]);
    return hasReadSleepPermission(granted) ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

async function readHealthConnectRecentSleep(): Promise<SleepReadSnapshot> {
  const { mod, status } = await initializeHealthConnect();
  if (!mod || status !== "undetermined") return { status, entry: null };

  const permission = await getHealthConnectSleepPermissionStatus();
  if (permission !== "granted") return { status: permission, entry: null };

  try {
    const windows = sleepLookbackWindows(SLEEP_SYNC_LOOKBACK_DAYS);
    for (const [index, window] of windows.entries()) {
      const timeRangeFilter = {
        operator: "between" as const,
        startTime: window.startTime,
        endTime: window.endTime,
      };
      const [result, aggregate] = await Promise.all([
        mod.readRecords("SleepSession", {
          timeRangeFilter,
          ascendingOrder: true,
          pageSize: 100,
        }),
        mod.aggregateRecord({ recordType: "SleepSession", timeRangeFilter }).catch(() => null),
      ]);
      const records = Array.isArray((result as { records?: unknown[] }).records)
        ? (result as { records: unknown[] }).records
        : result;
      const entry = normalizeHealthConnectSleepSessions(records, {
        canonicalDurationSeconds: aggregate?.SLEEP_DURATION_TOTAL,
        sourceOrigins: aggregate?.dataOrigins,
      });
      if (entry)
        return { status: "granted" as const, entry, checkedWindows: windows.slice(0, index + 1) };
    }
    return { status: "granted" as const, entry: null, checkedWindows: windows };
  } catch {
    return { status: "unavailable" as const, entry: null };
  }
}

async function loadHealthKit(): Promise<HealthKitModule | null> {
  if (Platform.OS !== "ios" || isExpoGo()) return null;
  try {
    return await import("@kingstinct/react-native-healthkit");
  } catch {
    return null;
  }
}

async function getHealthKitSleepPermissionStatus(): Promise<SleepPermissionStatus> {
  const healthKit = await loadHealthKit();
  if (!healthKit) return "unavailable";

  try {
    const available = await healthKit.isHealthDataAvailableAsync();
    if (!available) return "unavailable";
    const status = await healthKit.getRequestStatusForAuthorization({
      toRead: [HEALTHKIT_SLEEP_IDENTIFIER],
    });
    return status === 2 ? "granted" : "undetermined";
  } catch {
    return "unavailable";
  }
}

async function requestHealthKitSleepPermission(): Promise<SleepPermissionStatus> {
  const healthKit = await loadHealthKit();
  if (!healthKit) return "unavailable";

  try {
    const available = await healthKit.isHealthDataAvailableAsync();
    if (!available) return "unavailable";
    const granted = await healthKit.requestAuthorization({ toRead: [HEALTHKIT_SLEEP_IDENTIFIER] });
    return granted ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

async function readHealthKitRecentSleep(): Promise<SleepReadSnapshot> {
  const healthKit = await loadHealthKit();
  if (!healthKit) return { status: "unavailable" as const, entry: null };

  const permission = await getHealthKitSleepPermissionStatus();
  if (permission !== "granted") return { status: permission, entry: null };

  try {
    const windows = sleepLookbackWindows(SLEEP_SYNC_LOOKBACK_DAYS);
    for (const [index, window] of windows.entries()) {
      const samples = await healthKit.queryCategorySamples(HEALTHKIT_SLEEP_IDENTIFIER, {
        limit: 100,
        ascending: true,
        filter: {
          date: { startDate: new Date(window.startTime), endDate: new Date(window.endTime) },
        },
      });
      const entry = normalizeHealthKitSleepSamples(samples);
      if (entry)
        return { status: "granted" as const, entry, checkedWindows: windows.slice(0, index + 1) };
    }
    return { status: "granted" as const, entry: null, checkedWindows: windows };
  } catch {
    return { status: "unavailable" as const, entry: null };
  }
}

export async function getSleepPermissionStatus(): Promise<SleepPermissionStatus> {
  if (isExpoGo()) return "unavailable";
  if (Platform.OS === "android") return getHealthConnectSleepPermissionStatus();
  if (Platform.OS === "ios") return getHealthKitSleepPermissionStatus();
  return "unavailable";
}

export async function requestSleepPermission(): Promise<SleepPermissionStatus> {
  if (isExpoGo()) return "unavailable";
  if (Platform.OS === "android") return requestHealthConnectSleepPermission();
  if (Platform.OS === "ios") return requestHealthKitSleepPermission();
  return "unavailable";
}

export async function syncLastNightSleep(options?: { requestPermission?: boolean }): Promise<{
  ok: boolean;
  data?: SleepSyncResult;
  error?: string;
  status?: SleepPermissionStatus;
}> {
  const permission = await getSleepPermissionStatus();
  const shouldRequestPermission = options?.requestPermission ?? true;
  const status =
    permission === "granted" || !shouldRequestPermission
      ? permission
      : await requestSleepPermission();
  if (status !== "granted") {
    return {
      ok: false,
      status,
      error:
        status === "unavailable"
          ? "Sleep sync is unavailable on this device."
          : "Sleep permission is required to sync.",
    };
  }

  const snapshot =
    Platform.OS === "android"
      ? await readHealthConnectRecentSleep()
      : await readHealthKitRecentSleep();
  if (snapshot.status !== "granted") {
    return {
      ok: false,
      status: snapshot.status,
      error: "Could not read sleep data from your health provider.",
    };
  }
  if (!snapshot.entry) {
    const provider = Platform.OS === "android" ? "Health Connect" : "Apple Health";
    return {
      ok: false,
      status: "granted",
      error: sleepNoDataMessage(
        provider,
        snapshot.checkedWindows ?? sleepLookbackWindows(SLEEP_SYNC_LOOKBACK_DAYS),
      ),
    };
  }

  const source = Platform.OS === "android" ? "healthConnect" : "healthKit";
  const result = await syncNormalizedSleepEntry(source, snapshot.entry);
  return result.ok
    ? { ok: true, data: result.data }
    : { ok: false, status: "granted", error: result.error };
}
