import { useState, useEffect } from "react";
import { Alert, View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getHabit } from "@/lib/habits";
import { updateHabitFull } from "@/lib/actions";
import HabitForm from "@/components/habit-form";
import type { Habit } from "@/types/db";

export default function EditHabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [habit, setHabit] = useState<Habit | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { habit: h } = await getHabit(id);
      if (!cancelled) setHabit(h);
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function handleUpdate(data: Parameters<typeof updateHabitFull>[1]) {
    if (!id) return;
    const result = await updateHabitFull(id, data);
    if (result.ok) router.back();
    else Alert.alert("Could not save habit", result.error ?? "Try again.");
  }

  if (!habit) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-d-background items-center justify-center" edges={["top"]}>
        <ActivityIndicator size="large" color="#F26B1F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-md">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="text-headline-md text-on-background dark:text-d-on-background">Edit Habit</Text>
      </View>
      <HabitForm
        initial={habit}
        onSubmit={handleUpdate}
        submitLabel="Save changes"
      />
    </SafeAreaView>
  );
}
