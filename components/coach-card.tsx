import { Text, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { CoachSignal } from "@/lib/coach/coach";

type Props = {
  signal: CoachSignal;
  onPress: () => void;
  onAction: () => void;
};

function actionLabel(signal: CoachSignal): string {
  if (signal.suggestedAction === "log_value" && signal.suggestedValue) {
    const unit = signal.unit ? ` ${signal.unit}` : "";
    return `Log ${signal.suggestedValue}${unit}`;
  }
  return "Open";
}

export default function CoachCard({ signal, onPress, onAction }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="mx-margin-mobile mb-sm bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-start gap-md"
    >
      <View className="w-10 h-10 rounded-full bg-primary-fixed items-center justify-center">
        <MaterialCommunityIcons name="message-text-outline" size={20} color="#F26B1F" />
      </View>
      <View className="flex-1">
        <Text className="text-label-lg text-primary mb-xs">AI COACH</Text>
        <Text className="text-body-sm text-on-surface dark:text-d-on-surface">
          {signal.message}
        </Text>
      </View>
      <TouchableOpacity onPress={onAction} className="bg-primary px-sm py-xs rounded-full">
        <Text className="text-on-primary text-label-sm font-semibold">{actionLabel(signal)}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
