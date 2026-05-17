import { View, Text, FlatList, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "@/components/theme-provider";
import Icon from "./icon";
import type { ComputedBadge } from "@/lib/badges";

const TONE_BG: Record<string, string> = {
  yellow: "#fef9c3", purple: "#ede9fe", teal: "#ccfbf1",
  red: "#fee2e2", indigo: "#e0e7ff", orange: "#ffedd5",
};
const TONE_BG_DARK: Record<string, string> = {
  yellow: "#3d2e00", purple: "#2d1f6e", teal: "#003d3b",
  red: "#4a0000", indigo: "#1a1f5e", orange: "#3d1500",
};
const TONE_FG: Record<string, string> = {
  yellow: "#854d0e", purple: "#6d28d9", teal: "#134e4a",
  red: "#991b1b", indigo: "#3730a3", orange: "#9a3412",
};
const TONE_FG_DARK: Record<string, string> = {
  yellow: "#fde68a", purple: "#c4b5fd", teal: "#99f6e4",
  red: "#fca5a5", indigo: "#a5b4fc", orange: "#fdba74",
};

type Props = { badges: ComputedBadge[]; onShare?: (badge: ComputedBadge) => void };

export default function BadgeGrid({ badges, onShare }: Props) {
  const { colorScheme } = useTheme();
  const dark = colorScheme === "dark";

  return (
    <FlatList
      data={badges}
      numColumns={2}
      keyExtractor={(item) => item.id}
      scrollEnabled={false}
      columnWrapperStyle={{ gap: 8 }}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      renderItem={({ item }) => {
        const bgMap = dark ? TONE_BG_DARK : TONE_BG;
        const fgMap = dark ? TONE_FG_DARK : TONE_FG;
        const unearnedBg = dark ? "#2C2C36" : "#E6E0D5";
        const unearnedFg = dark ? "#7A7E88" : "#8F8A82";
        const bg = item.earned ? (bgMap[item.tone] ?? (dark ? "#3D1800" : "#FFE6CF")) : unearnedBg;
        const fg = item.earned ? (fgMap[item.tone] ?? "#F26B1F") : unearnedFg;
        return (
          <View
            className="flex-1 rounded-xl p-md"
            style={{ backgroundColor: bg, opacity: item.earned ? 1 : 0.55 }}
          >
            <View className="flex-row items-start justify-between mb-sm">
              <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: fg + "20" }}>
                <Icon name={item.icon} size={20} color={fg} />
              </View>
              {item.earned && onShare && (
                <TouchableOpacity
                  onPress={() => onShare(item)}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  className="p-xs"
                >
                  <MaterialCommunityIcons name="share-variant" size={16} color={fg + "cc"} />
                </TouchableOpacity>
              )}
            </View>
            <Text className="text-label-lg font-semibold mb-xs" style={{ color: fg }}>{item.name}</Text>
            <Text className="text-label-sm" style={{ color: fg + "aa" }}>{item.earned ? item.description : item.hintText}</Text>
            {!item.earned && item.progressPct > 0 && (
              <View className="h-1 bg-outline-variant rounded-full mt-sm overflow-hidden">
                <View className="h-full rounded-full" style={{ width: `${item.progressPct * 100}%`, backgroundColor: fg }} />
              </View>
            )}
          </View>
        );
      }}
    />
  );
}
