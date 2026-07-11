import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { showAlert } from "@/lib/platform/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import HabitForm from "@/components/habit-form";
import FirstLogFlow from "@/components/first-log-flow";
import { useActivation } from "@/components/activation-provider";
import { createHabit } from "@/lib/data/actions";
import { resolveManualCreatedHabit, type CreatedHabit } from "@/lib/coach/post-onboarding";
import { useLanguage } from "@/components/language-provider";
import { getCurrentSession } from "@/lib/supabase/client";

export default function NewHabitScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const activation = useActivation();
  const manualModeRef = useRef<"control" | "treatment" | null>(null);
  if (activation.ready && manualModeRef.current === null) {
    manualModeRef.current =
      activation.variant === "activation_v2" && activation.stage === "pre_value"
        ? "treatment"
        : "control";
  }
  const isTreatment = manualModeRef.current === "treatment";
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [userId, setUserId] = useState("");
  const [createdHabit, setCreatedHabit] = useState<CreatedHabit | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentSession()
      .then((session) => {
        if (!active) return;
        setHasSession(Boolean(session));
        setUserId(session?.user.id ?? "");
      })
      .finally(() => {
        if (active) setSessionChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(data: Parameters<typeof createHabit>[0]) {
    const result = await createHabit(data);
    if (result.ok) {
      if ("merged" in result && result.merged) {
        showAlert(
          t("Habit updated"),
          t("A similar habit already existed, so I bundled the new goal into it."),
        );
      } else if ("migrated" in result && result.migrated === false) {
        showAlert(
          t("Habit created"),
          t(
            "Some advanced tracking options couldn't be saved yet, but your habit is ready to use.",
          ),
        );
      }
      if (!isTreatment) {
        router.replace("/");
        return { ok: true };
      }
      if (!result.id) {
        // A successful mutation should always include an id. If a legacy
        // response does not, keep the user moving rather than trapping them.
        router.replace("/");
        return { ok: true };
      }

      setCreatedHabit(
        resolveManualCreatedHabit(result.habit, {
          id: result.id,
          name: data.name,
          icon: data.icon,
          color: data.color,
          unit: data.unit,
          target: data.target,
          habitType: data.habitType,
          metricType: data.metricType,
          visualType: data.visualType,
          reminderStrategy: data.reminderStrategy,
          reminderIntervalMinutes: data.reminderIntervalMinutes,
          defaultLogValue: data.defaultLogValue,
        }),
      );
      return { ok: true };
    }
    if ("validation" in result && result.validation) {
      return { ok: false, validation: result.validation };
    }
    showAlert(t("Could not create habit"), result.error ?? t("Try again."));
    return { ok: false };
  }

  if (!sessionChecked) return null;
  if (!hasSession) return <Redirect href="/login" />;
  if (!activation.ready || manualModeRef.current === null) return null;

  if (createdHabit) {
    return (
      <FirstLogFlow userId={userId} habit={createdHabit} onFinished={() => router.replace("/")} />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-md"
          accessibilityRole="button"
          accessibilityLabel={t("Go back")}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="text-headline-md text-on-background dark:text-d-on-background">
          {t("New Habit")}
        </Text>
      </View>
      <HabitForm
        variant={isTreatment ? "treatment" : "standard"}
        onSubmit={handleCreate}
        submitLabel={t("Create habit")}
      />
    </SafeAreaView>
  );
}
