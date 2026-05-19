import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useLanguage } from "@/components/language-provider";

export default function AccountDeletionPage() {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background justify-center px-margin-mobile">
      <View className="gap-md">
        <Text className="text-headline-lg text-on-background dark:text-d-on-background font-bold">
          {t("Account deletion")}
        </Text>
        <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
          {t(
            "Sign in, then open Settings, Privacy & Data, and Request account deletion. Your account and all your data (habits, completions, profile) are removed permanently within seconds.",
          )}
        </Text>
        <TouchableOpacity
          className="bg-primary rounded-full py-sm items-center"
          onPress={() => router.replace("/login")}
        >
          <Text className="text-on-primary text-label-lg font-semibold">{t("Sign in")}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
