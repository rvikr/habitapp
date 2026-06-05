export type ExpoRuntimeConstants = {
  appOwnership?: string | null;
  executionEnvironment?: string | null;
};

export function isExpoGoRuntime(constants: ExpoRuntimeConstants): boolean {
  return constants.executionEnvironment === "storeClient" || constants.appOwnership === "expo";
}
