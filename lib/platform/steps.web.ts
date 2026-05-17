import type { StepPermissionStatus, StepSnapshot, StepSubscription } from "./steps";

export async function isStepTrackingAvailable(): Promise<boolean> {
  return false;
}

export async function getStepPermissionStatus(): Promise<StepPermissionStatus> {
  return "denied";
}

export async function requestStepPermission(): Promise<StepPermissionStatus> {
  return "denied";
}

export async function getTodayStepSnapshot(): Promise<StepSnapshot> {
  return { steps: null, source: "unsupported", status: "unavailable", canWatch: false };
}

export async function getTodayStepCount(): Promise<number | null> {
  return null;
}

export function watchStepCount(_callback: (steps: number) => void): StepSubscription | null {
  return null;
}
