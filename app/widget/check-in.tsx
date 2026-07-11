import { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useLanguage } from "@/components/language-provider";
import { logCompletionOnce } from "@/lib/data/actions";
import { getHabit } from "@/lib/data/habits";
import { localDateKey } from "@/lib/utils/date";
import { widgetCheckInForValidatedState } from "@/lib/widgets/widget-check-in";

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

    const finish = async () => {
      const habitId = firstParam(params.habitId)?.trim();
      if (!habitId) return;

      const validated = await getHabit(habitId, { force: true });
      if (!validated.ok) return;
      const checkIn = widgetCheckInForValidatedState(validated, localDateKey());
      if (!checkIn) return;

      await logCompletionOnce(
        checkIn.habitId,
        Crypto.randomUUID(),
        checkIn.amount,
        "Logged from widget",
      );
    };

    void finish()
      .catch(() => undefined)
      .finally(() => router.replace("/" as never));
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
