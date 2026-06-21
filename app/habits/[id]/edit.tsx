import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { showAlert } from "@/lib/platform/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getHabit } from "@/lib/data/habits";
import { updateHabitFull } from "@/lib/data/actions";
import HabitForm from "@/components/habit-form";
import Skeleton, { SkeletonText } from "@/components/skeleton";
import { useLanguage } from "@/components/language-provider";
import type { Habit } from "@/types/db";

export default function EditHabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useLanguage();
  const [habit, setHabit] = useState<Habit | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { habit: h } = await getHabit(id);
      if (!cancelled) setHabit(h);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleUpdate(data: Parameters<typeof updateHabitFull>[1]) {
    if (!id) return { ok: false };
    const result = await updateHabitFull(id, data);
    if (result.ok) {
      router.back();
      return { ok: true };
    }
    if (result.validation) {
      return { ok: false, validation: result.validation };
    }
    showAlert(t("Could not save habit"), result.error ?? t("Try again."));
    return { ok: false };
  }

  if (!habit) {
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
          <SkeletonText className="h-8" width={140} />
        </View>
        <View className="w-full px-margin-mobile gap-md mt-lg">
          <SkeletonText className="h-8" width={140} />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-12 rounded-full" />
        </View>
      </SafeAreaView>
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
          {t("Edit Habit")}
        </Text>
      </View>
      <HabitForm initial={habit} onSubmit={handleUpdate} submitLabel={t("Save changes")} />
    </SafeAreaView>
  );
}
