export type StepPermissionStatus =
  | "granted"
  | "denied"
  | "undetermined"
  | "providerUpdateRequired"
  | "unavailable";
export type StepSource = "healthConnect" | "pedometer" | "unsupported";
export type StepSnapshot = {
  steps: number | null;
  source: StepSource;
  status: StepPermissionStatus;
  canWatch: boolean;
};
export type StepSubscription = { remove: () => void };

export declare function isStepTrackingAvailable(): Promise<boolean>;
export declare function getStepPermissionStatus(): Promise<StepPermissionStatus>;
export declare function requestStepPermission(): Promise<StepPermissionStatus>;
export declare function getTodayStepSnapshot(): Promise<StepSnapshot>;
export declare function getTodayStepCount(): Promise<number | null>;
export declare function watchStepCount(callback: (steps: number) => void): StepSubscription | null;
