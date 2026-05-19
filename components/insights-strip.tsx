import { ScrollView, View, Text } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Insights } from "@/lib/data/habits";
import { useLanguage } from "@/components/language-provider";

type InsightItem = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  color: string;
  bg: string;
  text: string;
};

function buildItems(
  insights: Insights,
  t: (message: string, values?: Record<string, string | number>) => string,
): InsightItem[] {
  const items: InsightItem[] = [];

  if (insights.mostProductiveDay) {
    items.push({
      icon: "calendar-star",
      color: "#F26B1F",
      bg: "#e6deff",
      text: t("Most productive on {day}s", { day: insights.mostProductiveDay }),
    });
  }

  if (insights.consistencyChangePct !== null) {
    const up = insights.consistencyChangePct >= 0;
    items.push({
      icon: up ? "trending-up" : "trending-down",
      color: up ? "#3EBB7F" : "#b3261e",
      bg: up ? "#76f6f240" : "#f2b8b540",
      text: up
        ? t("Consistency up {percent}% this month", {
            percent: insights.consistencyChangePct,
          })
        : t("Consistency down {percent}% this month", {
            percent: Math.abs(insights.consistencyChangePct),
          }),
    });
  }

  if (insights.peakTimeLabel) {
    items.push({
      icon: "clock-outline",
      color: "#E4A23A",
      bg: "#ffdbce",
      text: t("Most active {time}", { time: insights.peakTimeLabel }),
    });
  }

  return items;
}

type Props = {
  insights: Insights;
};

export default function InsightsStrip({ insights }: Props) {
  const { t } = useLanguage();
  const items = buildItems(insights, t);
  if (items.length === 0) return null;

  return (
    <View>
      <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm px-margin-mobile">
        {t("INSIGHTS")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {items.map((item) => (
          <View
            key={item.text}
            className="rounded-2xl p-md flex-row items-start gap-sm"
            style={{ backgroundColor: item.bg, width: 190 }}
          >
            <MaterialCommunityIcons
              name={item.icon}
              size={18}
              color={item.color}
              style={{ marginTop: 1 }}
            />
            <Text
              className="text-label-md flex-1 flex-wrap font-medium"
              style={{ color: item.color }}
            >
              {item.text}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
