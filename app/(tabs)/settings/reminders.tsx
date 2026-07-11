import { useState, useCallback, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, Switch } from "react-native";
import { showAlert } from "@/lib/platform/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getHabitsForToday } from "@/lib/data/habits";
import { updateHabitReminders } from "@/lib/data/actions";
import { requestPermission, getPermissionStatus } from "@/lib/platform/notifications";
import { syncScheduledReminders, buildSmartBody } from "@/lib/data/reminder-sync";
import { getReminderSchedule } from "@/lib/data/reminders";
import { getCurrentProAccess } from "@/lib/subscription/revenuecat";
import { ProUpgradeBanner } from "@/components/pro-access-banner";
import Skeleton, { SkeletonText } from "@/components/skeleton";
import HabitSyncIssueBanner from "@/components/habit-sync-issue-banner";
import { useLanguage } from "@/components/language-provider";
import type { Habit } from "@/types/db";
import type { ReminderStrategy } from "@/lib/coach/habit-intelligence";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function smartReminderSummary(
  intervalMinutes: number | null | undefined,
  strategy: ReminderStrategy,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const interval = intervalMinutes ?? 720;
  const slotsPerDay = Math.round((14 * 60) / interval);
  const count = Math.max(1, slotsPerDay);
  if (strategy === "conditional_interval") {
    if (count === 1) return t("1 smart reminder/day, stops once done");
    return t("Up to {count} smart reminders/day, stops once done", { count });
  }
  if (count === 1) return t("1 smart reminder/day");
  return t("Up to {count} smart reminders/day", { count });
}

export default function RemindersScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [permission, setPermission] = useState<"granted" | "denied" | "undetermined">(
    "undetermined",
  );
  const [previewMessages, setPreviewMessages] = useState<Record<string, string>>({});
  const [hasPro, setHasPro] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const reviewableHabitIds = useMemo(() => habits.map((habit) => habit.id), [habits]);

  const load = useCallback(async (options?: { force?: boolean }) => {
    const { habits: h } = await getHabitsForToday(options);
    setHabits(h);
    const status = await getPermissionStatus();
    setPermission(status);

    const access = await getCurrentProAccess();
    setHasPro(access.hasPro);

    // Load enriched schedule to show contextual preview messages.
    const schedule = await getReminderSchedule({ aiSmartReminders: false });
    const previews: Record<string, string> = {};
    for (const entry of schedule) {
      if (!(entry.habitId in previews)) {
        previews[entry.habitId] =
          entry.coachMessage ?? buildSmartBody(entry.habitName, entry.context);
      }
    }
    setPreviewMessages(previews);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleRequestPermission() {
    const granted = await requestPermission();
    setPermission(granted ? "granted" : "denied");
    if (granted) await syncScheduledReminders();
  }

  async function handleToggle(habit: Habit) {
    const enabled = !habit.reminders_enabled;
    if (enabled && permission !== "granted") {
      const granted = await requestPermission();
      setPermission(granted ? "granted" : "denied");
      if (!granted) {
        showAlert(
          t("Notifications are disabled"),
          t("Enable notifications before turning on reminders."),
        );
        return;
      }
    }

    const usesSmartReminders =
      habit.reminder_strategy === "interval" || habit.reminder_strategy === "conditional_interval";
    // Manual-only habits need at least one time; smart habits work without manual times
    if (enabled && !usesSmartReminders && (habit.reminder_times ?? []).length === 0) {
      showAlert(
        t("No reminder time set"),
        t("Edit the habit to add a custom time, or the system will use smart reminders."),
      );
      return;
    }

    const result = await updateHabitReminders(habit.id, {
      enabled,
      times: habit.reminder_times ?? [],
      days: habit.reminder_days ?? [0, 1, 2, 3, 4, 5, 6],
    });
    if (!result.ok) {
      showAlert(t("Could not update reminders"), t(result.error ?? "Try again."));
      return;
    }
    setHabits((prev) =>
      prev.map((h) => (h.id === habit.id ? { ...h, reminders_enabled: enabled } : h)),
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("Go back")}
          onPress={() => router.back()}
          className="mr-md"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="text-headline-md text-on-background dark:text-d-on-background">
          {t("Reminders")}
        </Text>
      </View>

      <HabitSyncIssueBanner
        reviewableHabitIds={reviewableHabitIds}
        onReview={(failure) => router.push(`/habits/${failure.habitId}` as never)}
      />

      {permission !== "granted" && (
        <View className="mx-margin-mobile mb-md bg-primary-fixed rounded-xl p-md flex-row items-center gap-md">
          <MaterialCommunityIcons name="bell-alert" size={24} color="#F26B1F" />
          <View className="flex-1">
            <Text className="text-body-md text-on-background font-semibold">
              {t("Enable notifications")}
            </Text>
            <Text className="text-label-sm text-on-surface-variant">
              {t("Allow notifications to receive habit reminders.")}
            </Text>
          </View>
          <TouchableOpacity
            className="bg-primary px-md py-xs rounded-full"
            accessibilityRole="button"
            accessibilityLabel={t("Allow notifications")}
            onPress={handleRequestPermission}
          >
            <Text className="text-on-primary text-label-sm font-semibold">{t("Allow")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-margin-mobile gap-sm">
          {hasPro === false ? (
            <ProUpgradeBanner
              title={t("AI-timed reminders")}
              body={t(
                "Free reminders use standard timing. Upgrade to Pro for AI-optimized reminder timing, plus AI Coach and weekly reports.",
              )}
              actionLabel={t("View plans")}
              onAction={() => router.push("/pro" as never)}
            />
          ) : null}
          {!loaded ? (
            <ReminderSkeleton />
          ) : (
            habits.map((habit) => (
              <View
                key={habit.id}
                className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md"
              >
                <View className="flex-row items-center justify-between mb-sm">
                  <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                    {habit.name}
                  </Text>
                  <Switch
                    value={habit.reminders_enabled ?? false}
                    onValueChange={() => handleToggle(habit)}
                    trackColor={{ false: "#E6E0D5", true: "#F26B1F" }}
                    thumbColor="#fff"
                  />
                </View>
                {(habit.reminder_strategy === "interval" ||
                  habit.reminder_strategy === "conditional_interval") && (
                  <Text className="text-label-sm text-primary">
                    {smartReminderSummary(
                      habit.reminder_interval_minutes,
                      habit.reminder_strategy as ReminderStrategy,
                      t,
                    )}
                  </Text>
                )}
                {habit.reminder_times && habit.reminder_times.length > 0 && (
                  <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                    {t("Custom override: {times}", { times: habit.reminder_times.join(", ") })}
                  </Text>
                )}
                {habit.reminder_days && habit.reminder_days.length < 7 && (
                  <View className="flex-row gap-xs mt-xs flex-wrap">
                    {habit.reminder_days.map((d) => (
                      <Text
                        key={d}
                        className="text-label-sm bg-primary-fixed text-primary px-xs py-xs rounded"
                      >
                        {DAY_LABELS[d]}
                      </Text>
                    ))}
                  </View>
                )}
                {habit.reminders_enabled && previewMessages[habit.id] && (
                  <View className="mt-sm flex-row items-center gap-xs bg-primary-fixed/40 rounded-lg px-sm py-xs">
                    <MaterialCommunityIcons name="message-text-outline" size={14} color="#F26B1F" />
                    <Text className="text-label-sm text-primary flex-1" numberOfLines={2}>
                      {previewMessages[habit.id]}
                    </Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReminderSkeleton() {
  return (
    <>
      {[0, 1, 2].map((item) => (
        <View
          key={item}
          className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-sm"
        >
          <View className="flex-row items-center justify-between">
            <SkeletonText width="54%" />
            <Skeleton className="w-12 h-7 rounded-full" />
          </View>
          <SkeletonText className="h-3" width="66%" />
        </View>
      ))}
    </>
  );
}
