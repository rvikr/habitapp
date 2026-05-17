import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Svg, { Path } from "react-native-svg";
import type { Habit } from "@/types/db";
import type { HabitProgress } from "@/lib/habit-intelligence";
import { useTheme } from "@/components/theme-provider";

type Props = {
  habit: Habit;
  done: boolean;
  progress?: HabitProgress;
  streak?: number;
  onToggle: () => void | Promise<void>;
  onPress: () => void;
};

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

export default function HabitCard({ habit, done, progress, streak = 0, onToggle, onPress }: Props) {
  const [toggling, setToggling] = useState(false);
  const { colorScheme } = useTheme();
  const isDark = colorScheme === "dark";

  const borderColor = isDark ? "#2C2C36" : "#E6E0D5";
  const accentColor = "#FFC56B";
  const primaryColor = "#F26B1F";

  const subtitle = progress?.label ?? (habit.description || (habit.target ? `Goal: ${habit.target} ${habit.unit ?? ""}`.trim() : null));

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
      activeOpacity={0.7}
      className="flex-row items-center bg-surface dark:bg-d-surface rounded-2xl gap-md"
      style={{
        borderWidth: 1,
        borderColor,
        padding: 14,
        paddingLeft: 16,
      }}
    >
      {/* Text content */}
      <View className="flex-1">
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
            style={{ fontSize: 11, fontWeight: "500", marginTop: 2 }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}

        {/* Streak row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
          <FlameIcon size={11} color={accentColor} />
          <Text style={{ fontSize: 11, fontWeight: "700", color: accentColor, letterSpacing: 0.2 }}>
            {streak > 0 ? `${streak} day streak` : "Start your streak"}
          </Text>
        </View>
      </View>

      {/* Circle check button */}
      <TouchableOpacity
        onPress={handleToggleTap}
        disabled={toggling}
        activeOpacity={0.8}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: done ? primaryColor : "transparent",
          borderWidth: done ? 0 : 2,
          borderColor,
          alignItems: "center",
          justifyContent: "center",
          opacity: toggling ? 0.6 : 1,
        }}
      >
        {done && <CheckIcon size={14} color="#fff" />}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
