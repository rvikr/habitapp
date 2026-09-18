import { Text, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "@/components/language-provider";
import type { Habit, HabitCompletion } from "@/types/db";
import { summarizeHabitTrend, type HabitTrendRange } from "@/lib/data/habit-trends";

type Props = {
  habit: Habit;
  completions: HabitCompletion[];
  range: HabitTrendRange;
  onRangeChange: (range: HabitTrendRange) => void;
  accent: string;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function HabitTrendCard({
  habit,
  completions,
  range,
  onRangeChange,
  accent,
}: Props) {
  const { t, language } = useLanguage();
  const summary = summarizeHabitTrend(habit, completions, range);
  const strongest = summary.strongestWeekday
    ? t(WEEKDAYS[summary.strongestWeekday.weekday])
    : t("Not enough data");
  const direction =
    summary.direction == null
      ? t("More data needed")
      : summary.direction === "steady"
        ? t("No change")
        : t("{value} points vs previous period", {
            value: `${summary.changePctPoints! > 0 ? "+" : ""}${summary.changePctPoints}`,
          });
  const typicalTime = summary.timing
    ? new Date(2020, 0, 1, summary.timing.hour).toLocaleTimeString(
        language === "hi" ? "hi-IN" : "en-US",
        { hour: "numeric" },
      )
    : null;

  return (
    <View className="mx-margin-mobile mb-lg rounded-2xl bg-surface-container dark:bg-d-surface border border-outline-variant dark:border-d-outline-variant p-md gap-md">
      <View className="flex-row items-center justify-between gap-sm">
        <View className="flex-row items-center gap-sm flex-1">
          <MaterialCommunityIcons name="chart-timeline-variant" size={22} color={accent} />
          <Text className="text-body-md text-on-background dark:text-d-on-background font-semibold">
            {t("Habit trend")}
          </Text>
        </View>
        <View className="flex-row rounded-full bg-background dark:bg-d-background p-1">
          {([7, 30] as const).map((option) => (
            <TouchableOpacity
              key={option}
              accessibilityRole="button"
              accessibilityLabel={t("Show {days} day habit trend", { days: option })}
              accessibilityState={{ selected: range === option }}
              onPress={() => onRangeChange(option)}
              className="rounded-full px-md py-xs"
              style={{ backgroundColor: range === option ? accent : "transparent" }}
            >
              <Text
                className="text-label-sm font-semibold"
                style={{ color: range === option ? "#FFFFFF" : "#8F8A82" }}
              >
                {option}D
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View className="flex-row items-end gap-1" style={{ height: 72 }}>
        {summary.points.map((point) => (
          <View key={point.date} className="flex-1 justify-end" style={{ height: "100%" }}>
            <View
              accessibilityLabel={t("{date}: {percent}% progress", {
                date: point.date,
                percent: Math.round(point.progressRatio * 100),
              })}
              style={{
                height: `${Math.max(point.progressRatio * 100, point.scheduled ? 5 : 2)}%`,
                minHeight: point.scheduled ? 4 : 2,
                borderRadius: 4,
                backgroundColor: point.targetHit ? accent : `${accent}55`,
                opacity: point.scheduled ? 1 : 0.35,
              }}
            />
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        <Metric label={t("Target hit")} value={`${Math.round(summary.targetHitRate * 100)}%`} />
        <Metric label={t("Consistency")} value={`${Math.round(summary.consistencyRate * 100)}%`} />
        <Metric label={t("Average progress")} value={`${summary.averageProgressPct}%`} />
        <Metric label={t("Strongest day")} value={strongest} />
      </View>

      <View className="flex-row items-center justify-between gap-md">
        <Text className="flex-1 text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
          {direction}
        </Text>
        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
          {typicalTime
            ? t("Usually logged around {time}", { time: typicalTime })
            : t("Logging time needs more data")}
        </Text>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: "50%", paddingVertical: 6 }}>
      <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
        {label}
      </Text>
      <Text className="text-body-md text-on-background dark:text-d-on-background font-semibold">
        {value}
      </Text>
    </View>
  );
}
