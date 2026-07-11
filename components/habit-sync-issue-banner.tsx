import { useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "@/components/language-provider";
import {
  acknowledgeHabitReconciliationFailures,
  listHabitReconciliationFailures,
} from "@/lib/data/habit-mutation-queue";
import type { HabitMutationReconciliationFailure } from "@/lib/data/habit-mutation-queue-store";

type Props = {
  habitId?: string;
  refreshToken?: number;
  reviewableHabitIds?: readonly string[];
  onReview?: (failure: HabitMutationReconciliationFailure) => void;
};

export default function HabitSyncIssueBanner({
  habitId,
  refreshToken = 0,
  reviewableHabitIds,
  onReview,
}: Props) {
  const { t } = useLanguage();
  const [failures, setFailures] = useState<HabitMutationReconciliationFailure[]>([]);

  const load = useCallback(() => listHabitReconciliationFailures(habitId), [habitId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void refreshToken;
      void load()
        .then((nextFailures) => {
          if (active) setFailures(nextFailures);
        })
        .catch(() => {
          if (active) setFailures([]);
        });
      return () => {
        active = false;
      };
    }, [load, refreshToken]),
  );

  if (failures.length === 0) return null;
  const firstFailure = failures[0];
  const canReview =
    !!onReview && (!reviewableHabitIds || reviewableHabitIds.includes(firstFailure.habitId));

  async function dismiss() {
    const ids = failures.map((failure) => failure.id);
    try {
      await acknowledgeHabitReconciliationFailures(ids);
      setFailures([]);
    } catch {
      // Keep the warning visible when local acknowledgment storage fails.
    }
  }

  return (
    <View
      className="mx-margin-mobile my-sm rounded-xl bg-tertiary-container p-md"
      style={{ borderWidth: 1, borderColor: "#B88400" }}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View className="flex-row gap-sm">
        <MaterialCommunityIcons name="cloud-alert-outline" size={22} color="#7A5700" />
        <View className="flex-1">
          <Text className="text-body-md font-semibold text-on-tertiary-container">
            {t("Some changes didn't sync")}
          </Text>
          <Text className="mt-xs text-label-sm text-on-tertiary-container">
            {t("A previous offline change didn't sync.")}{" "}
            {t("Review the affected habit and save or delete it again.")}
          </Text>
          <Text className="mt-xs text-label-sm text-on-tertiary-container">
            {t("Dismissing this notice will not apply the change.")}
          </Text>
          <View className="mt-sm flex-row flex-wrap gap-sm">
            {canReview ? (
              <TouchableOpacity
                className="rounded-full bg-primary px-md py-xs"
                accessibilityRole="button"
                accessibilityLabel={t("Review habit")}
                onPress={() => onReview(firstFailure)}
              >
                <Text className="text-label-sm font-semibold text-on-primary">
                  {t("Review habit")}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              className="rounded-full border border-outline px-md py-xs"
              accessibilityRole="button"
              accessibilityLabel={t("Dismiss")}
              accessibilityHint={t("Dismissing this notice will not apply the change.")}
              onPress={() => void dismiss()}
            >
              <Text className="text-label-sm font-semibold text-on-tertiary-container">
                {t("Dismiss")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}
