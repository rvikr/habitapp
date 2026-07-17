import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { syncScheduledReminders } from "@/lib/data/reminder-sync";
import { toggleHabit } from "@/lib/data/actions";
import {
  COMPLETE_ACTION_ID,
  getAppBadgeCount,
  registerNotificationCategories,
  setAppBadgeCount,
} from "@/lib/platform/notifications";
import { getItem, setItem } from "@/lib/platform/storage";

const HANDLED_ACTIONS_KEY = "habbit:handled-notification-actions";
const HANDLED_ACTIONS_MAX = 20;

// Returns true the first time a response key is seen. The same response can
// arrive via both the live listener and getLastNotificationResponseAsync on
// the next launch; replaying it could overwrite progress logged in between.
async function markHandledOnce(key: string): Promise<boolean> {
  try {
    const raw = await getItem(HANDLED_ACTIONS_KEY);
    const handled: string[] = raw ? JSON.parse(raw) : [];
    if (handled.includes(key)) return false;
    handled.push(key);
    await setItem(HANDLED_ACTIONS_KEY, JSON.stringify(handled.slice(-HANDLED_ACTIONS_MAX)));
    return true;
  } catch {
    return true;
  }
}

export default function NotificationScheduler() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;

    registerNotificationCategories().catch(() => {});
    syncScheduledReminders();

    let cancelled = false;
    let remove: (() => void) | undefined;
    (async () => {
      const Notifications = await import("expo-notifications");
      if (cancelled) return;

      const handleResponse = async (
        response: import("expo-notifications").NotificationResponse,
      ) => {
        const habitId = response.notification.request.content.data?.habitId as string | undefined;

        if (response.actionIdentifier === COMPLETE_ACTION_ID) {
          if (!habitId) return;
          const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
          if (!(await markHandledOnce(key))) return;
          // Reuses the in-app completion path (session + offline queue). If the
          // app was killed when the button was tapped, this runs on next launch
          // via the last-response check below and is dated to that day.
          const result = await toggleHabit(habitId, false);
          if (result.ok) {
            Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(
              () => {},
            );
            // The app is backgrounded/killed here, so the dashboard sync that
            // normally maintains the badge won't run. Decrement it directly so
            // the "remaining today" count stays right until the next open.
            const current = await getAppBadgeCount();
            await setAppBadgeCount(current - 1);
          }
          return;
        }

        // Single-habit reminders deep-link to the habit; bundled reminders carry
        // no habitId, so open the dashboard where all pending habits are listed.
        if (habitId) router.push(`/habits/${habitId}`);
        else router.push("/");
      };

      const sub = Notifications.addNotificationResponseReceivedListener((response) => {
        void handleResponse(response);
      });
      remove = () => sub.remove();

      // "Mark done" taps while the app was killed don't fire the live listener
      // (the action doesn't foreground the app); they surface here on the next
      // launch. Default taps are left to the listener — last responses persist
      // across launches, so replaying navigation here would redirect the user
      // on unrelated opens.
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last && last.actionIdentifier === COMPLETE_ACTION_ID) void handleResponse(last);
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [router]);

  return null;
}
