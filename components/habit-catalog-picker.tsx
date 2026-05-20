import { View, Text, FlatList, TouchableOpacity, Image } from "react-native";
import { HABIT_CATALOG, type CatalogEntry } from "@/lib/data/habit-catalog";
import { getHabitImage } from "@/lib/data/habit-images";
import type { HabitType } from "@/types/db";
import { useLanguage } from "@/components/language-provider";

type Props = {
  onSelect: (entry: CatalogEntry) => void;
  onSkip: () => void;
};

export default function HabitCatalogPicker({ onSelect, onSkip }: Props) {
  const { t } = useLanguage();
  return (
    <View className="flex-1">
      <View className="px-margin-mobile py-sm">
        <Text className="text-headline-md text-on-background dark:text-d-on-background mb-xs">
          {t("Choose a template")}
        </Text>
        <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
          {t("Or build a custom habit.")}
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
            <Text className="text-body-md text-primary font-semibold">
              {t("Build custom habit")}
            </Text>
          </TouchableOpacity>
        }
        renderItem={({ item }) => {
          const imageUrl = getHabitImage(item.template as HabitType);
          return (
            <TouchableOpacity
              className="flex-row items-center bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-md gap-md"
              onPress={() => onSelect(item)}
              activeOpacity={0.7}
            >
              <View style={{ width: 48, height: 48, borderRadius: 12, overflow: "hidden" }}>
                <Image
                  source={{ uri: imageUrl }}
                  style={{ width: 48, height: 48 }}
                  resizeMode="cover"
                />
              </View>
              <View className="flex-1">
                <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                  {t(item.name)}
                </Text>
                <Text
                  className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
                  numberOfLines={1}
                >
                  {t(item.description)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
