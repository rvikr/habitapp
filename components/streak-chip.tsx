import { View, Text } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

type Props = {
  count: number;
  total?: number;
  label?: string;
};

export default function StreakChip({ count, total, label }: Props) {
  return (
    <View className="flex-row items-center gap-xs bg-primary-fixed px-sm py-xs rounded-full">
      <MaterialCommunityIcons name="fire" size={14} color="#F26B1F" />
      <Text className="text-label-sm text-primary font-semibold">
        {total != null ? `${count}/${total}` : count}
        {label ? ` ${label}` : ""}
      </Text>
    </View>
  );
}
