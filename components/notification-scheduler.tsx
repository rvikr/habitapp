import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { syncScheduledReminders } from "@/lib/data/reminder-sync";

export default function NotificationScheduler() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;

    syncScheduledReminders();

    let cancelled = false;
    let remove: (() => void) | undefined;
    (async () => {
      const Notifications = await import("expo-notifications");
      if (cancelled) return;
      const sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const habitId = response.notification.request.content.data?.habitId as string | undefined;
        // Single-habit reminders deep-link to the habit; bundled reminders carry
        // no habitId, so open the dashboard where all pending habits are listed.
        if (habitId) router.push(`/habits/${habitId}`);
        else router.push("/");
      });
      remove = () => sub.remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [router]);

  return null;
}
