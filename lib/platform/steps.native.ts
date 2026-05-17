import { Platform } from "react-native";
import { Pedometer } from "expo-sensors";
import type { StepPermissionStatus, StepSnapshot, StepSubscription } from "./steps";
import {
  healthConnectTodayRange,
  normalizeHealthConnectStepAggregate,
  normalizeStepCount,
} from "../data/steps-shared";

const HEALTH_CONNECT_STEPS_PERMISSION = { accessType: "read", recordType: "Steps" } as const;

type HealthConnectModule = typeof import("react-native-health-connect");

function normalizePedometerPermissionStatus(status: string): StepPermissionStatus {
  if (status === "granted" || status === "denied") return status;
  return "undetermined";
}

async function getPedometerPermissionStatus(): Promise<StepPermissionStatus> {
  try {
    const permission = await Pedometer.getPermissionsAsync();
    return normalizePedometerPermissionStatus(permission.status);
  } catch {
    return "undetermined";
  }
}

async function requestPedometerPermission(): Promise<StepPermissionStatus> {
  try {
    const permission = await Pedometer.requestPermissionsAsync();
    return normalizePedometerPermissionStatus(permission.status);
  } catch {
    return "denied";
  }
}

async function isPedometerAvailable(): Promise<boolean> {
  try {
    return await Pedometer.isAvailableAsync();
  } catch {
    return false;
  }
}

async function loadHealthConnect(): Promise<HealthConnectModule | null> {
  if (Platform.OS !== "android") return null;
  try {
    return await import("react-native-health-connect");
  } catch {
    return null;
  }
}

async function getHealthConnectStatus(
  mod?: HealthConnectModule | null,
): Promise<StepPermissionStatus> {
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
  status: StepPermissionStatus;
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

function hasReadStepsPermission(
  permissions: { accessType?: string; recordType?: string }[],
): boolean {
  return permissions.some(
    (permission) => permission.accessType === "read" && permission.recordType === "Steps",
  );
}

async function getHealthConnectPermissionStatus(): Promise<StepPermissionStatus> {
  const { mod, status } = await initializeHealthConnect();
  if (!mod || status !== "undetermined") return status;

  try {
    const granted = await mod.getGrantedPermissions();
    return hasReadStepsPermission(granted) ? "granted" : "undetermined";
  } catch {
    return "undetermined";
  }
}

async function requestHealthConnectPermission(): Promise<StepPermissionStatus> {
  const { mod, status } = await initializeHealthConnect();
  if (!mod || status !== "undetermined") return status;

  try {
    const granted = await mod.requestPermission([HEALTH_CONNECT_STEPS_PERMISSION]);
    return hasReadStepsPermission(granted) ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

async function readHealthConnectTodaySteps(): Promise<StepSnapshot> {
  const { mod, status } = await initializeHealthConnect();
  if (!mod || status !== "undetermined") {
    return { steps: null, source: "healthConnect", status, canWatch: false };
  }

  const permission = await getHealthConnectPermissionStatus();
  if (permission !== "granted") {
    return { steps: null, source: "healthConnect", status: permission, canWatch: false };
  }

  try {
    const result = await mod.aggregateRecord({
      recordType: "Steps",
      timeRangeFilter: healthConnectTodayRange(),
    });
    return {
      steps: normalizeHealthConnectStepAggregate(result),
      source: "healthConnect",
      status: "granted",
      canWatch: false,
    };
  } catch {
    return { steps: null, source: "healthConnect", status: "unavailable", canWatch: false };
  }
}

async function readPedometerTodaySteps(): Promise<StepSnapshot> {
  if (!(await isPedometerAvailable())) {
    return { steps: null, source: "unsupported", status: "unavailable", canWatch: false };
  }

  const status = await getPedometerPermissionStatus();
  if (status !== "granted") {
    return { steps: null, source: "pedometer", status, canWatch: true };
  }

  if (Platform.OS !== "ios") {
    return { steps: null, source: "pedometer", status: "granted", canWatch: true };
  }

  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const result = await Pedometer.getStepCountAsync(start, new Date());
    return {
      steps: normalizeStepCount(result.steps),
      source: "pedometer",
      status: "granted",
      canWatch: true,
    };
  } catch {
    return { steps: null, source: "pedometer", status: "granted", canWatch: true };
  }
}

export async function isStepTrackingAvailable(): Promise<boolean> {
  if (Platform.OS === "android") {
    const healthStatus = await getHealthConnectStatus();
    if (healthStatus === "undetermined") return true;
  }
  return isPedometerAvailable();
}

export async function getStepPermissionStatus(): Promise<StepPermissionStatus> {
  if (Platform.OS === "android") {
    const healthStatus = await getHealthConnectPermissionStatus();
    if (healthStatus === "granted" || healthStatus === "undetermined") return healthStatus;
    const pedometerStatus = await getPedometerPermissionStatus();
    return pedometerStatus === "granted" ? "granted" : healthStatus;
  }
  return getPedometerPermissionStatus();
}

export async function requestStepPermission(): Promise<StepPermissionStatus> {
  if (Platform.OS === "android") {
    const healthStatus = await requestHealthConnectPermission();
    if (healthStatus === "granted") return "granted";

    if (await isPedometerAvailable()) {
      const pedometerStatus = await requestPedometerPermission();
      if (pedometerStatus === "granted") return "granted";
    }
    return healthStatus;
  }
  return requestPedometerPermission();
}

export async function getTodayStepSnapshot(): Promise<StepSnapshot> {
  if (Platform.OS === "android") {
    const healthSnapshot = await readHealthConnectTodaySteps();
    if (healthSnapshot.status === "granted" || !(await isPedometerAvailable()))
      return healthSnapshot;

    const pedometerSnapshot = await readPedometerTodaySteps();
    if (pedometerSnapshot.status === "granted") return pedometerSnapshot;
    return healthSnapshot;
  }
  return readPedometerTodaySteps();
}

export async function getTodayStepCount(): Promise<number | null> {
  const snapshot = await getTodayStepSnapshot();
  return snapshot.steps;
}

export function watchStepCount(callback: (steps: number) => void): StepSubscription | null {
  try {
    const subscription = Pedometer.watchStepCount((result) =>
      callback(normalizeStepCount(result.steps)),
    );
    return { remove: () => subscription.remove() };
  } catch {
    return null;
  }
}
