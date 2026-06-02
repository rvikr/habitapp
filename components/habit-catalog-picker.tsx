import { View, Text, SectionList, TouchableOpacity, Image } from "react-native";
import { HABIT_CATALOG_SECTIONS, type CatalogEntry } from "@/lib/data/habit-catalog";
import { getHabitImage } from "@/lib/data/habit-images";
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
      <SectionList
        sections={HABIT_CATALOG_SECTIONS}
        keyExtractor={(item) => item.template}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        renderSectionHeader={({ section }) => (
          <View className="pt-md pb-xs bg-background dark:bg-d-background">
            <Text className="text-label-lg text-primary font-semibold">{t(section.title)}</Text>
          </View>
        )}
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
          const imageUrl = getHabitImage(item.habitType);
          return (
            <TouchableOpacity
              className="flex-row items-center bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-md gap-md mb-xs"
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
