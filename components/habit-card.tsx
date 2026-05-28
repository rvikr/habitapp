import { useState } from "react";
import { View, Text, TouchableOpacity, ImageBackground } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { Habit } from "@/types/db";
import type { HabitProgress } from "@/lib/coach/habit-intelligence";
import { useLanguage } from "@/components/language-provider";
import { getHabitImageForHabit } from "@/lib/data/habit-images";

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
  const { t } = useLanguage();

  const accentColor = "#FFC56B";
  const primaryColor = "#F26B1F";

  const subtitle =
    progress?.label ??
    (habit.description ||
      (habit.target
        ? t("Goal: {target} {unit}", { target: habit.target, unit: habit.unit ?? "" }).trim()
        : null));

  const imageUrl = getHabitImageForHabit(habit);

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
      style={{ borderRadius: 16, overflow: "hidden" }}
    >
      <ImageBackground
        source={{ uri: imageUrl }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 14,
          paddingLeft: 16,
          gap: 12,
          minHeight: 80,
        }}
      >
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.52)",
          }}
        />

        <View style={{ flex: 1, zIndex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }} numberOfLines={1}>
            {habit.name}
          </Text>
          {subtitle ? (
            <Text
              style={{
                fontSize: 11,
                fontWeight: "500",
                color: "rgba(255,255,255,0.75)",
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
            <FlameIcon size={11} color={accentColor} />
            <Text
              style={{ fontSize: 11, fontWeight: "700", color: accentColor, letterSpacing: 0.2 }}
            >
              {streak > 0 ? t("{count} day streak", { count: streak }) : t("Start your streak")}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleToggleTap}
          disabled={toggling}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={
            done
              ? t("Mark {name} not done", { name: habit.name })
              : t("Mark {name} done", { name: habit.name })
          }
          accessibilityState={{ checked: done, disabled: toggling }}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: done ? primaryColor : "transparent",
            borderWidth: done ? 0 : 2,
            borderColor: "rgba(255,255,255,0.6)",
            alignItems: "center",
            justifyContent: "center",
            opacity: toggling ? 0.6 : 1,
            zIndex: 1,
          }}
        >
          {done && <CheckIcon size={14} color="#fff" />}
        </TouchableOpacity>
      </ImageBackground>
    </TouchableOpacity>
  );
}
