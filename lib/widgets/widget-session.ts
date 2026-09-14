import { Platform } from "react-native";

import {
  clearHomeWidgetActionCredentials,
  configureHomeWidgetActions,
  getHomeWidgetDeviceId,
  hasValidHomeWidgetActionSession,
  setHomeWidgetBackgroundStepSyncEnabled,
} from "@/lib/platform/home-widget";
import { getBackgroundStepPermissionStatus } from "@/lib/platform/steps";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { getWidgetBackgroundStepsConsent } from "@/lib/widgets/widget-background-steps";

type WidgetSessionResponse = {
  ok?: boolean;
  token?: string;
  expiresAt?: string;
  actionUrl?: string;
  actionsEnabled?: boolean;
};

// This is deliberately off unless the native release profile opts in. It
// prevents a JavaScript-only/OTA delivery from activating native widget writes.
export const WIDGET_BACKGROUND_ACTIONS_ENABLED =
  process.env.EXPO_PUBLIC_WIDGET_BACKGROUND_ACTIONS_ENABLED === "true";

let registration: Promise<void> | null = null;
let nextRegistrationAtMs = 0;

async function syncAndroidBackgroundStepSchedule(): Promise<void> {
  if (Platform.OS !== "android") return;
  const consented = await getWidgetBackgroundStepsConsent();
  const permission = consented ? await getBackgroundStepPermissionStatus() : "undetermined";
  await setHomeWidgetBackgroundStepSyncEnabled(consented && permission === "granted");
}

export function ensureHomeWidgetActionSession(): Promise<void> {
  if (!WIDGET_BACKGROUND_ACTIONS_ENABLED) {
    if (Platform.OS === "android") {
      return setHomeWidgetBackgroundStepSyncEnabled(false)
        .then(() => undefined)
        .catch(() => undefined);
    }
    return Promise.resolve();
  }
  if (Platform.OS === "web" || !isSupabaseConfigured()) {
    return Promise.resolve();
  }
  if (Date.now() < nextRegistrationAtMs) return Promise.resolve();
  if (registration) return registration;

  registration = (async () => {
    // Bound retries while offline; a successful registration extends this to
    // twelve hours (cold launches can still rotate the 30-day credential).
    nextRegistrationAtMs = Date.now() + 5 * 60_000;
    if (await hasValidHomeWidgetActionSession()) {
      await syncAndroidBackgroundStepSchedule();
      nextRegistrationAtMs = Date.now() + 12 * 60 * 60_000;
      return;
    }
    const deviceId = await getHomeWidgetDeviceId();
    if (!deviceId) return;

    const { data, error } = await supabase.functions.invoke<WidgetSessionResponse>(
      "widget-session",
      {
        body: { action: "register", deviceId, platform: Platform.OS },
      },
    );
    if (
      error ||
      !data?.ok ||
      data.actionsEnabled !== true ||
      !data.token ||
      !data.expiresAt ||
      !data.actionUrl
    )
      return;

    const configured = await configureHomeWidgetActions(
      JSON.stringify({
        deviceId,
        token: data.token,
        expiresAt: data.expiresAt,
        actionUrl: data.actionUrl,
        anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
      }),
    );
    if (configured) {
      await syncAndroidBackgroundStepSchedule();
      nextRegistrationAtMs = Date.now() + 12 * 60 * 60_000;
    }
  })().finally(() => {
    // A later foreground sync may rotate an expiring credential or recover
    // after an offline registration attempt.
    registration = null;
  });
  return registration;
}

export async function revokeHomeWidgetActionSession(): Promise<void> {
  nextRegistrationAtMs = 0;
  const deviceId = await getHomeWidgetDeviceId().catch(() => null);
  try {
    if (WIDGET_BACKGROUND_ACTIONS_ENABLED && deviceId && isSupabaseConfigured()) {
      await Promise.race([
        supabase.functions.invoke("widget-session", {
          body: { action: "revoke", deviceId, platform: Platform.OS },
        }),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  } finally {
    await clearHomeWidgetActionCredentials().catch(() => undefined);
  }
}
