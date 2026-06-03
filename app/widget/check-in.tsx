import { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { logCompletion } from "@/lib/data/actions";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseValue(value: string | string[] | undefined): number {
  const raw = firstParam(value);
  if (!raw) return 1;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : 1;
}

export default function WidgetCheckInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ habitId?: string | string[]; value?: string | string[] }>();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const habitId = firstParam(params.habitId)?.trim();
    if (!habitId) {
      router.replace("/");
      return;
    }

    (async () => {
      await logCompletion(habitId, parseValue(params.value), "Logged from widget");
      router.replace("/");
    })();
  }, [params.habitId, params.value, router]);

  return (
    <View className="flex-1 items-center justify-center bg-background dark:bg-d-background gap-sm">
      <ActivityIndicator color="#F26B1F" />
      <Text className="text-body-sm text-on-surface-variant dark:text-d-on-surface-variant">
        Checking in...
      </Text>
    </View>
  );
}
