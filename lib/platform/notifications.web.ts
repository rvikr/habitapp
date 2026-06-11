import { supabase, getCurrentUser } from "../supabase/client";
import { registerAppServiceWorker } from "./sw-register";

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

// Registers the service worker and subscribes to Web Push, then persists the
// subscription to Supabase. Silently no-ops if VAPID key is missing or APIs
// are unavailable (e.g. running in Expo Go on web dev server).
async function registerPushSubscription(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const user = await getCurrentUser();
  if (!user) return;

  const reg = await registerAppServiceWorker();
  if (!reg) return;
  await navigator.serviceWorker.ready;

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // Refresh last_seen_at so the sender knows the subscription is still live.
    await supabase
      .from("web_push_subscriptions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("endpoint", existing.endpoint);
    return;
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const json = sub.toJSON() as {
    endpoint: string;
    keys?: { p256dh: string; auth: string };
  };
  if (!json.keys) return;

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await supabase.from("web_push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      timezone,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
}

export async function requestPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  const result = await Notification.requestPermission();
  if (result === "granted") {
    registerPushSubscription().catch(console.warn);
  }
  return result === "granted";
}

export async function getPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  if (typeof Notification === "undefined") return "undetermined";
  // The browser reports the not-yet-asked state as "default"; the app's shared
  // adapter type uses "undetermined", so normalize it here.
  return Notification.permission === "default" ? "undetermined" : Notification.permission;
}

// Web notification actions are handled by the service worker (public/sw.js),
// so category registration is a no-op; the constants exist for signature
// parity with the native adapter.
export const HABIT_REMINDER_CATEGORY = "habit-reminder";
export const COMPLETE_ACTION_ID = "complete";

export async function registerNotificationCategories(): Promise<void> {}

// Web relies on the server-side web-push-reminders edge function for delivery,
// so client-side scheduling is a no-op.
export async function scheduleWeeklyReminder(
  _weekday: number,
  _time: string,
  _title: string,
  _body: string,
  _data: Record<string, unknown>,
  _categoryIdentifier?: string,
): Promise<string> {
  return "";
}

export async function scheduleDateReminder(
  _fireAt: Date,
  _title: string,
  _body: string,
  _data: Record<string, unknown>,
  _categoryIdentifier?: string,
): Promise<string> {
  return "";
}

export async function cancelScheduledReminder(_id: string): Promise<void> {}

export async function cancelAllReminders(): Promise<void> {}
