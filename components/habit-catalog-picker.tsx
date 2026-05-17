import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { HABIT_CATALOG, type CatalogEntry } from "@/lib/data/habit-catalog";
import Icon from "./icon";

const COLOR_BG: Record<string, string> = {
  primary: "#FFE6CF",
  secondary: "#CFEBDF",
  tertiary: "#FFF0CC",
  neutral: "#E6E0D5",
};
const COLOR_FG: Record<string, string> = {
  primary: "#F26B1F",
  secondary: "#3EBB7F",
  tertiary: "#E4A23A",
  neutral: "#5A554D",
};

type Props = {
  onSelect: (entry: CatalogEntry) => void;
  onSkip: () => void;
};

export default function HabitCatalogPicker({ onSelect, onSkip }: Props) {
  return (
    <View className="flex-1">
      <View className="px-margin-mobile py-sm">
        <Text className="text-headline-md text-on-background dark:text-d-on-background mb-xs">
          Choose a template
        </Text>
        <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
          Or build a custom habit.
        </Text>
      </View>
      <FlatList
        data={HABIT_CATALOG}
        keyExtractor={(item) => item.template}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 8 }}
        ListFooterComponent={
          <TouchableOpacity
            className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md items-center mt-sm"
            onPress={onSkip}
          >
            <Text className="text-body-md text-primary font-semibold">Build custom habit</Text>
          </TouchableOpacity>
        }
        renderItem={({ item }) => {
          const bg = COLOR_BG[item.color] ?? "#e6deff";
          const fg = COLOR_FG[item.color] ?? "#F26B1F";
          return (
            <TouchableOpacity
              className="flex-row items-center bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-md gap-md"
              onPress={() => onSelect(item)}
              activeOpacity={0.7}
            >
              <View
                className="w-12 h-12 rounded-full items-center justify-center"
                style={{ backgroundColor: bg }}
              >
                <Icon name={item.icon} size={22} color={fg} />
              </View>
              <View className="flex-1">
                <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                  {item.name}
                </Text>
                <Text
                  className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
                  numberOfLines={1}
                >
                  {item.description}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
