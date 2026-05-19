import { Text, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { CoachSignal } from "@/lib/coach/coach";
import { useLanguage } from "@/components/language-provider";

type Props = {
  signal: CoachSignal;
  onPress: () => void;
  onAction: () => void;
};

function actionLabel(signal: CoachSignal, t: (message: string, values?: Record<string, string | number>) => string): string {
  if (signal.suggestedAction === "log_value" && signal.suggestedValue) {
    const unit = signal.unit ? ` ${signal.unit}` : "";
    return t("Log {value}{unit}", { value: signal.suggestedValue, unit });
  }
  return t("Open");
}

export default function CoachCard({ signal, onPress, onAction }: Props) {
  const { t } = useLanguage();
  return (
    <TouchableOpacity
      onPress={onPress}
      className="mx-margin-mobile mb-sm bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-start gap-md"
    >
      <View className="w-10 h-10 rounded-full bg-primary-fixed items-center justify-center">
        <MaterialCommunityIcons name="message-text-outline" size={20} color="#F26B1F" />
      </View>
      <View className="flex-1">
        <Text className="text-label-lg text-primary mb-xs">{t("AI COACH")}</Text>
        <Text className="text-body-sm text-on-surface dark:text-d-on-surface">
          {signal.message}
        </Text>
      </View>
      <TouchableOpacity onPress={onAction} className="bg-primary px-sm py-xs rounded-full">
        <Text className="text-on-primary text-label-sm font-semibold">
          {actionLabel(signal, t)}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
