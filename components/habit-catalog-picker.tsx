import { View, Text, SectionList, TouchableOpacity } from "react-native";
import Svg, { Path } from "react-native-svg";
import { HABIT_CATALOG_SECTIONS, type CatalogEntry } from "@/lib/data/habit-catalog";
import { getHabitVisual, type HabitVisual } from "@/lib/data/habit-images";
import { useLanguage } from "@/components/language-provider";

type Props = {
  onSelect: (entry: CatalogEntry) => void;
  onSkip: () => void;
};

function CatalogVisual({ visual }: { visual: HabitVisual }) {
  return (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: visual.base,
      }}
    >
      <View
        style={{
          position: "absolute",
          width: 42,
          height: 42,
          borderRadius: 21,
          top: -12,
          left: -10,
          backgroundColor: visual.accent,
          opacity: 0.32,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 54,
          height: 54,
          borderRadius: 27,
          right: -16,
          bottom: -18,
          backgroundColor: visual.glow,
          opacity: 0.2,
        }}
      />
      <Svg width={48} height={48} viewBox="0 0 600 400" style={{ opacity: 0.72 }}>
        <Path
          d={visual.mark}
          fill="none"
          stroke={visual.accent}
          strokeWidth="34"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

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
            accessibilityRole="button"
          >
            <Text className="text-body-md text-primary font-semibold">
              {t("Build custom habit")}
            </Text>
          </TouchableOpacity>
        }
        renderItem={({ item }) => {
          const visual = getHabitVisual(item.habitType);
          return (
            <TouchableOpacity
              className="flex-row items-center bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-md gap-md mb-xs"
              onPress={() => onSelect(item)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t("Choose template: {label}", { label: t(item.name) })}
            >
              <CatalogVisual visual={visual} />
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
