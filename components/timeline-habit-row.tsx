import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { Habit } from "@/types/db";
import type { HabitProgress } from "@/lib/coach/habit-intelligence";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { getHabitVisualForHabit } from "@/lib/data/habit-images";
import Icon from "@/components/icon";

type Props = {
  habit: Habit;
  done: boolean;
  progress?: HabitProgress;
  streak?: number;
  // "HH:MM" reminder anchor shown in the subtitle; null for untimed habits.
  timeLabel: string | null;
  isFirst: boolean;
  isLast: boolean;
  toggleAccessibilityLabel?: string;
  onToggle: () => void | Promise<void>;
  onPress: () => void;
};

const RAIL_WIDTH = 44;
const NODE_SIZE = 40;

function FlameIcon({ size = 11, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2 C 14 6 18 8 18 14 a 6 6 0 0 1 -12 0 c 0 -3 2 -5 3 -7 c 1 2 2 3 2 5 c 1 -2 1 -4 1 -10 Z"
        fill={color}
      />
    </Svg>
  );
}

function CheckIcon({ size = 14, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12.5 L10 17 L19 7"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function TimelineHabitRow({
  habit,
  done,
  progress,
  streak = 0,
  timeLabel,
  isFirst,
  isLast,
  toggleAccessibilityLabel,
  onToggle,
  onPress,
}: Props) {
  const [toggling, setToggling] = useState(false);
  const { t } = useLanguage();
  const { colorScheme } = useTheme();
  const dark = colorScheme === "dark";

  const visual = getHabitVisualForHabit(habit);
  const accent = visual.accent;
  const railColor = dark ? "#2C2C36" : "#E6E0D5";
  const surfaceColor = dark ? "#131316" : "#FFFFFF";

  const statusLabel = progress
    ? t(progress.label)
    : habit.description ||
      (habit.target
        ? t("Goal: {target} {unit}", { target: habit.target, unit: habit.unit ?? "" }).trim()
        : null);
  const subtitle = [timeLabel, statusLabel].filter(Boolean).join(" · ");

  async function handleToggleTap(e: { stopPropagation: () => void }) {
    e.stopPropagation();
    if (toggling) return;
    setToggling(true);
    try {
      await onToggle();
    } finally {
      setToggling(false);
    }
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t("Open {name} details", { name: habit.name })}
      style={{ flexDirection: "row", alignItems: "stretch" }}
    >
      {/* Rail: line segments + icon node, sitting on the shared vertical line */}
      <View style={{ width: RAIL_WIDTH, alignItems: "center" }}>
        <View
          style={{
            width: 2,
            height: 8,
            backgroundColor: isFirst ? "transparent" : railColor,
          }}
        />
        <View
          style={{
            width: NODE_SIZE,
            height: NODE_SIZE,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: accent,
            backgroundColor: surfaceColor,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={habit.icon} size={20} color={accent} />
        </View>
        <View
          style={{
            width: 2,
            flex: 1,
            backgroundColor: isLast ? "transparent" : railColor,
          }}
        />
      </View>

      <View
        className="flex-1 rounded-2xl border"
        style={{
          marginLeft: 12,
          marginBottom: isLast ? 0 : 12,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: surfaceColor,
          borderColor: railColor,
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text
            className="text-on-surface dark:text-d-on-surface"
            style={{ fontSize: 15, fontWeight: "700" }}
            numberOfLines={1}
          >
            {habit.name}
          </Text>
          {subtitle ? (
            <Text
              className="text-on-surface-variant dark:text-d-on-surface-variant"
              style={{ fontSize: 11, marginTop: 3 }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
          {streak > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 5 }}>
              <FlameIcon size={10} color={accent} />
              <Text style={{ fontSize: 10, fontWeight: "700", color: accent }}>{streak}d</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={handleToggleTap}
          disabled={toggling}
          activeOpacity={0.8}
          // "checkbox", not "button": a button role renders a real <button>
          // on web, and nesting it inside the card's <button> is invalid HTML.
          accessibilityRole="checkbox"
          accessibilityLabel={
            toggleAccessibilityLabel ??
            (done
              ? t("Mark {name} not done", { name: habit.name })
              : t("Mark {name} done", { name: habit.name }))
          }
          accessibilityState={{ checked: done, disabled: toggling }}
          style={{
            width: 24,
            height: 24,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: accent,
            backgroundColor: done ? accent : "transparent",
            alignItems: "center",
            justifyContent: "center",
            opacity: toggling ? 0.6 : 1,
          }}
        >
          {done && <CheckIcon size={13} color={dark ? "#0B0B0E" : "#FFFFFF"} />}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}
