import {
  parseHomeWidgetDiagnostics,
  type HomeWidgetDiagnosticEntry,
} from "@/lib/widgets/widget-diagnostics";
export async function updateHomeWidgetSnapshot(snapshotJson: string): Promise<void> {
  try {
    const { requireNativeModule } = await import("expo");
    const widget = requireNativeModule<{ updateAsync?: (value: string) => Promise<void> }>(
      "LaganWidget",
    );
    await widget.updateAsync?.(snapshotJson);
  } catch {
    // iOS 1.0.0 has no native widget module; this remains a safe no-op there.
  }
}

export async function clearHomeWidgetSnapshot(): Promise<void> {
  try {
    const { requireNativeModule } = await import("expo");
    const widget = requireNativeModule<{ clearAsync?: () => Promise<void> }>("LaganWidget");
    await widget.clearAsync?.();
  } catch {
    // iOS 1.0.0 has no native widget module; this remains a safe no-op there.
  }
}

export async function getHomeWidgetDeviceId(): Promise<string | null> {
  try {
    const { requireNativeModule } = await import("expo");
    const widget = requireNativeModule<{
      getDeviceIdAsync?: () => Promise<string>;
    }>("LaganWidget");
    return widget.getDeviceIdAsync ? widget.getDeviceIdAsync() : null;
  } catch {
    return null;
  }
}

export async function configureHomeWidgetActions(configurationJson: string): Promise<boolean> {
  try {
    const { requireNativeModule } = await import("expo");
    const widget = requireNativeModule<{
      configureActionsAsync?: (value: string) => Promise<void>;
    }>("LaganWidget");
    if (!widget.configureActionsAsync) return false;
    await widget.configureActionsAsync(configurationJson);
    return true;
  } catch {
    return false;
  }
}

export async function setHomeWidgetBackgroundStepSyncEnabled(_enabled: boolean): Promise<boolean> {
  return false;
}

export async function clearHomeWidgetActionCredentials(): Promise<void> {
  try {
    const { requireNativeModule } = await import("expo");
    const widget = requireNativeModule<{
      clearActionCredentialsAsync?: () => Promise<void>;
    }>("LaganWidget");
    await widget.clearActionCredentialsAsync?.();
  } catch {
    // Auth teardown must never be blocked by an unavailable native extension.
  }
}

export async function hasValidHomeWidgetActionSession(): Promise<boolean> {
  try {
    const { requireNativeModule } = await import("expo");
    const widget = requireNativeModule<{
      hasValidActionSessionAsync?: () => Promise<boolean>;
    }>("LaganWidget");
    return widget.hasValidActionSessionAsync ? widget.hasValidActionSessionAsync() : false;
  } catch {
    return false;
  }
}

export async function retryHomeWidgetPendingShortcutActions(): Promise<void> {
  try {
    const { requireNativeModule } = await import("expo");
    const widget = requireNativeModule<{
      retryShortcutActionsAsync?: () => Promise<void>;
    }>("LaganWidget");
    await widget.retryShortcutActionsAsync?.();
  } catch {
    // Siri intents are absent from older native binaries.
  }
}

export async function getHomeWidgetDiagnostics(): Promise<HomeWidgetDiagnosticEntry[]> {
  try {
    const { requireNativeModule } = await import("expo");
    const widget = requireNativeModule<{
      getWidgetDiagnosticsAsync?: () => Promise<string>;
    }>("LaganWidget");
    if (!widget.getWidgetDiagnosticsAsync) return [];
    return parseHomeWidgetDiagnostics(await widget.getWidgetDiagnosticsAsync());
  } catch {
    return [];
  }
}

export async function clearHomeWidgetDiagnostics(): Promise<void> {
  try {
    const { requireNativeModule } = await import("expo");
    const widget = requireNativeModule<{
      clearWidgetDiagnosticsAsync?: () => Promise<void>;
    }>("LaganWidget");
    await widget.clearWidgetDiagnosticsAsync?.();
  } catch {
    // Diagnostics are optional and absent from older native binaries.
  }
}
