import { Alert, View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import HabitForm from "@/components/habit-form";
import { createHabit } from "@/lib/data/actions";
import { useLanguage } from "@/components/language-provider";

export default function NewHabitScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  async function handleCreate(data: Parameters<typeof createHabit>[0]) {
    const result = await createHabit(data);
    if (result.ok) {
      if ("merged" in result && result.merged) {
        Alert.alert(
          t("Habit updated"),
          t("A similar habit already existed, so I bundled the new goal into it."),
        );
      } else if ("migrated" in result && result.migrated === false) {
        Alert.alert(
          t("Habit created"),
          t(
            "Some advanced tracking options couldn't be saved yet, but your habit is ready to use.",
          ),
        );
      }
      router.replace("/");
      return { ok: true };
    }
    if ("validation" in result && result.validation) {
      return { ok: false, validation: result.validation };
    }
    Alert.alert(t("Could not create habit"), result.error ?? t("Try again."));
    return { ok: false };
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-md">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="text-headline-md text-on-background dark:text-d-on-background">
          {t("New Habit")}
        </Text>
      </View>
      <HabitForm onSubmit={handleCreate} submitLabel={t("Create habit")} />
    </SafeAreaView>
  );
}
