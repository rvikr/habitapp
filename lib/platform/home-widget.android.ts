import { requireNativeModule } from "expo";

type LaganWidgetModule = {
  updateAsync(snapshotJson: string): Promise<void>;
  clearAsync(): Promise<void>;
  configureActionsAsync?(configurationJson: string): Promise<void>;
  getDeviceIdAsync?(): Promise<string>;
  clearActionCredentialsAsync?(): Promise<void>;
  hasValidActionSessionAsync?(): Promise<boolean>;
  retryShortcutActionsAsync?(): Promise<void>;
};

const LaganWidget = requireNativeModule<LaganWidgetModule>("LaganWidget");

export async function updateHomeWidgetSnapshot(snapshotJson: string): Promise<void> {
  await LaganWidget.updateAsync(snapshotJson);
}

export async function clearHomeWidgetSnapshot(): Promise<void> {
  await LaganWidget.clearAsync();
}

export async function getHomeWidgetDeviceId(): Promise<string | null> {
  return LaganWidget.getDeviceIdAsync ? LaganWidget.getDeviceIdAsync() : null;
}

export async function configureHomeWidgetActions(configurationJson: string): Promise<boolean> {
  if (!LaganWidget.configureActionsAsync) return false;
  await LaganWidget.configureActionsAsync(configurationJson);
  return true;
}

export async function clearHomeWidgetActionCredentials(): Promise<void> {
  await LaganWidget.clearActionCredentialsAsync?.();
}

export async function hasValidHomeWidgetActionSession(): Promise<boolean> {
  return LaganWidget.hasValidActionSessionAsync ? LaganWidget.hasValidActionSessionAsync() : false;
}

export async function retryHomeWidgetPendingShortcutActions(): Promise<void> {}
