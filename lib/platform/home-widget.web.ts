import type { HomeWidgetDiagnosticEntry } from "@/lib/widgets/widget-diagnostics";
export async function updateHomeWidgetSnapshot(_snapshotJson: string): Promise<void> {}

export async function clearHomeWidgetSnapshot(): Promise<void> {}

export async function getHomeWidgetDeviceId(): Promise<string | null> {
  return null;
}

export async function configureHomeWidgetActions(_configurationJson: string): Promise<boolean> {
  return false;
}

export async function clearHomeWidgetActionCredentials(): Promise<void> {}

export async function hasValidHomeWidgetActionSession(): Promise<boolean> {
  return false;
}

export async function retryHomeWidgetPendingShortcutActions(): Promise<void> {}

export async function getHomeWidgetDiagnostics(): Promise<HomeWidgetDiagnosticEntry[]> {
  return [];
}

export async function clearHomeWidgetDiagnostics(): Promise<void> {}
