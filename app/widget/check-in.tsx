import { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useLanguage } from "@/components/language-provider";
import { logCompletionOnce } from "@/lib/data/actions";
import { getHabit } from "@/lib/data/habits";
import { localDateKey } from "@/lib/utils/date";
import { widgetCheckInForValidatedState } from "@/lib/widgets/widget-check-in";
import { formatAmount, progressForHabit } from "@/lib/coach/habit-intelligence";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function WidgetCheckInScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ habitId?: string | string[] }>();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const finish = async (): Promise<Record<string, string> | null> => {
      const habitId = firstParam(params.habitId)?.trim();
      if (!habitId) return null;

      const validated = await getHabit(habitId, { force: true });
      if (!validated.ok || !validated.habit) return null;
      const checkIn = widgetCheckInForValidatedState(validated, localDateKey());
      if (!checkIn) return null;
      const habit = validated.habit;

      const result = await logCompletionOnce(
        checkIn.habitId,
        Crypto.randomUUID(),
        checkIn.amount,
        "Logged from widget",
        undefined,
        habit,
      );
      if (!result.ok) return null;

      // This screen redirects away immediately, so hand the log to the dashboard
      // to show the same confirmation an in-app log gives.
      const today = localDateKey();
      const currentValue = progressForHabit(
        habit,
        validated.completions.find((completion) => completion.completed_on === today) ?? null,
      ).current;
      const nextProgress = progressForHabit(habit, { value: currentValue + checkIn.amount });
      return {
        loggedAmount: formatAmount(checkIn.amount),
        loggedUnit: habit.unit ?? "",
        loggedTotal: nextProgress.label,
        loggedDone: nextProgress.isDone ? "1" : "",
      };
    };

    void finish()
      .then((toastParams) =>
        router.replace((toastParams ? { pathname: "/", params: toastParams } : "/") as never),
      )
      .catch(() => router.replace("/" as never));
  }, [params.habitId, router]);

  return (
    <View
      className="flex-1 items-center justify-center bg-background dark:bg-d-background gap-sm"
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator color="#F26B1F" />
      <Text className="text-body-sm text-on-surface-variant dark:text-d-on-surface-variant">
        {t("Logging check-in...")}
      </Text>
    </View>
  );
}
