import { Alert, View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import HabitForm from "@/components/habit-form";
import { createHabit } from "@/lib/actions";

export default function NewHabitScreen() {
  const router = useRouter();

  async function handleCreate(data: Parameters<typeof createHabit>[0]) {
    const result = await createHabit(data);
    if (result.ok) {
      if ("merged" in result && result.merged) {
        Alert.alert("Habit updated", "A similar habit already existed, so I bundled the new goal into it.");
      } else if ("migrated" in result && result.migrated === false) {
        Alert.alert("Habit created", "Apply the latest Supabase migration to enable saved smart metrics for this habit.");
      }
      router.replace("/");
    } else Alert.alert("Could not create habit", result.error ?? "Try again.");
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-md">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="text-headline-md text-on-background dark:text-d-on-background">New Habit</Text>
      </View>
      <HabitForm onSubmit={handleCreate} submitLabel="Create habit" />
    </SafeAreaView>
  );
}
