import { Text, useWindowDimensions, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "@/components/language-provider";

type CellState = "full" | "limited" | "locked" | "blocked";

type Cell = {
  text: string;
  sub?: string;
  state: CellState;
};

type FeatureRow = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  free: Cell;
  pro: Cell;
};

const FEATURES: FeatureRow[] = [
  {
    icon: "target",
    label: "Create/manage habits",
    free: { text: "Full access", state: "full" },
    pro: { text: "Full access", state: "full" },
  },
  {
    icon: "bell-outline",
    label: "Reminders",
    free: { text: "Works", sub: "Pattern-based timing", state: "full" },
    pro: { text: "Works", sub: "AI-optimized timing", state: "full" },
  },
  {
    icon: "fire",
    label: "Habit logging & streaks",
    free: { text: "Full access", state: "full" },
    pro: { text: "Full access", state: "full" },
  },
  {
    icon: "trophy-outline",
    label: "Achievements & badges",
    free: { text: "Full access", state: "full" },
    pro: { text: "Full access", state: "full" },
  },
  {
    icon: "message-text-outline",
    label: "AI coach messages",
    free: { text: "Generic", sub: "Fallback text", state: "limited" },
    pro: { text: "Personalized", sub: "AI encouragement", state: "full" },
  },
  {
    icon: "emoticon-outline",
    label: "AI coach tone",
    free: { text: "Locked", sub: 'Default "friendly"', state: "locked" },
    pro: { text: "5 custom tones", state: "full" },
  },
  {
    icon: "auto-fix",
    label: "AI routine refinement",
    free: { text: "Rules-based", sub: "Starter routine", state: "limited" },
    pro: { text: "AI-refined", sub: "During onboarding", state: "full" },
  },
  {
    icon: "file-chart-outline",
    label: "Weekly progress reports",
    free: { text: "Blocked", state: "blocked" },
    pro: { text: "AI-generated", sub: "Weekly summaries", state: "full" },
  },
];

const STATE_ICON: Record<
  CellState,
  { name: keyof typeof MaterialCommunityIcons.glyphMap; color: string }
> = {
  full: { name: "check-circle", color: "#3EBB7F" },
  limited: { name: "minus-circle", color: "#E4A23A" },
  locked: { name: "lock-outline", color: "#8F8A82" },
  blocked: { name: "lock", color: "#FF5A5A" },
};

function ComparisonCell({
  cell,
  emphasized,
  compact,
}: {
  cell: Cell;
  emphasized?: boolean;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const icon = STATE_ICON[cell.state];
  return (
    <View
      className={`flex-1 items-center gap-xs ${compact ? "px-xs" : "px-sm"} py-sm ${
        emphasized ? "bg-primary-fixed/40 dark:bg-d-surface-high/50" : ""
      }`}
    >
      <MaterialCommunityIcons name={icon.name} size={compact ? 18 : 22} color={icon.color} />
      <Text
        className={`text-label-sm text-center ${
          cell.state === "blocked" ? "text-error" : "text-on-surface dark:text-d-on-surface"
        }`}
      >
        {t(cell.text)}
      </Text>
      {cell.sub ? (
        <Text className="text-label-sm text-center text-on-surface-variant dark:text-d-on-surface-variant">
          {t(cell.sub)}
        </Text>
      ) : null}
    </View>
  );
}

export function ProComparison() {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const featurePad = compact ? "px-sm" : "px-md";

  return (
    <View className="gap-sm">
      <Text className="text-headline-md text-on-background dark:text-d-on-background">
        {t("What's included")}
      </Text>
      <View className="bg-surface-container dark:bg-d-surface-container rounded-xl overflow-hidden">
        {/* Header row */}
        <View className="flex-row items-center border-b border-outline-variant dark:border-d-outline-variant">
          <View className={`flex-[1.5] ${featurePad} py-sm`}>
            <Text className="text-label-lg text-on-surface dark:text-d-on-surface">
              {t("Feature")}
            </Text>
          </View>
          <View className={`flex-1 items-center ${compact ? "px-xs" : "px-sm"} py-sm`}>
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant">
              {t("Free")}
            </Text>
          </View>
          <View
            className={`flex-1 flex-row items-center justify-center gap-xs ${
              compact ? "px-xs" : "px-sm"
            } py-sm bg-primary-fixed/40 dark:bg-d-surface-high/50`}
          >
            <MaterialCommunityIcons name="star-four-points" size={14} color="#F26B1F" />
            <Text className="text-label-lg text-primary font-semibold">{t("Pro")}</Text>
          </View>
        </View>

        {/* Feature rows */}
        {FEATURES.map((row, index) => (
          <View
            key={row.label}
            className={`flex-row items-stretch ${
              index < FEATURES.length - 1
                ? "border-b border-outline-variant dark:border-d-outline-variant"
                : ""
            }`}
          >
            <View className={`flex-[1.5] flex-row items-center gap-sm ${featurePad} py-sm`}>
              <MaterialCommunityIcons name={row.icon} size={compact ? 18 : 20} color="#F26B1F" />
              <Text className="text-label-lg text-on-surface dark:text-d-on-surface flex-1">
                {t(row.label)}
              </Text>
            </View>
            <ComparisonCell cell={row.free} compact={compact} />
            <ComparisonCell cell={row.pro} emphasized compact={compact} />
          </View>
        ))}
      </View>
    </View>
  );
}
