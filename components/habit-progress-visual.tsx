import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { VisualType } from "@/lib/coach/habit-intelligence";

type Props = {
  visualType?: VisualType | null;
  progress: number;
  size?: "compact" | "large";
  color?: string;
  trackColor?: string;
};

export default function HabitProgressVisual({
  visualType,
  progress,
  size = "compact",
  color = "#F26B1F",
  trackColor = "#e1e3e4",
}: Props) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const animatedProgress = useSharedValue(clamped);
  const dimension = size === "large" ? 156 : 58;

  useEffect(() => {
    animatedProgress.value = withTiming(clamped, { duration: 550 });
  }, [animatedProgress, clamped]);

  const fillStyle = useAnimatedStyle(() => ({
    height: `${animatedProgress.value * 100}%`,
  }));
  const widthStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%`,
  }));

  if (visualType === "water_bottle") {
    return (
      <View style={[styles.frame, { width: dimension, height: dimension }]}>
        <View style={[styles.bottleNeck, { borderColor: color }]} />
        <View style={[styles.bottle, { borderColor: color, backgroundColor: trackColor }]}>
          <Animated.View style={[styles.waterFill, { backgroundColor: "#4fc3f7" }, fillStyle]} />
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Path
              d="M9 22 C18 14 30 30 43 20"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="3"
              fill="none"
            />
          </Svg>
        </View>
      </View>
    );
  }

  if (visualType === "step_path") {
    return (
      <View style={[styles.frame, { width: dimension, height: dimension }]}>
        <Svg width={dimension} height={dimension} viewBox="0 0 64 64">
          <Path
            d="M9 47 C21 25 36 40 54 16"
            stroke={trackColor}
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M9 47 C21 25 36 40 54 16"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${clamped * 84} 84`}
          />
          {[12, 24, 36, 48].map((x, index) => (
            <Circle
              key={x}
              cx={x}
              cy={index % 2 === 0 ? 43 : 30}
              r="4"
              fill={clamped > index / 4 ? color : trackColor}
            />
          ))}
        </Svg>
      </View>
    );
  }

  if (visualType === "sleep_moon") {
    return (
      <View style={[styles.frame, { width: dimension, height: dimension }]}>
        <Svg width={dimension} height={dimension} viewBox="0 0 64 64">
          <Circle cx="32" cy="32" r="24" fill={trackColor} />
          <Circle cx="39" cy="25" r="23" fill="#fff" />
          <Circle cx="48" cy="14" r="3" fill={color} opacity={0.75} />
          <Path
            d="M14 50 H50"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${clamped * 36} 36`}
          />
        </Svg>
      </View>
    );
  }

  if (visualType === "reading_book") {
    return (
      <View style={[styles.frame, { width: dimension, height: dimension }]}>
        <Svg width={dimension} height={dimension} viewBox="0 0 64 64">
          <Path
            d="M12 15 h16 c4 0 4 4 4 4 v31 c0-3-3-5-7-5 H12 Z"
            fill={trackColor}
            stroke={color}
            strokeWidth="3"
          />
          <Path
            d="M52 15 H36 c-4 0-4 4-4 4 v31 c0-3 3-5 7-5 h13 Z"
            fill={trackColor}
            stroke={color}
            strokeWidth="3"
          />
          <Rect x="16" y="22" width={clamped * 12} height="4" rx="2" fill={color} />
          <Rect x="36" y="22" width={clamped * 12} height="4" rx="2" fill={color} />
          <Rect x="16" y="31" width={clamped * 10} height="4" rx="2" fill={color} opacity={0.75} />
          <Rect x="36" y="31" width={clamped * 10} height="4" rx="2" fill={color} opacity={0.75} />
        </Svg>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { width: dimension, height: dimension }]}>
      <Svg width={dimension} height={dimension} viewBox="0 0 64 64">
        <Circle cx="32" cy="32" r="25" stroke={trackColor} strokeWidth="8" fill="none" />
        <Circle
          cx="32"
          cy="32"
          r="25"
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${clamped * 157} 157`}
          rotation="-90"
          origin="32, 32"
        />
      </Svg>
      {size === "large" && (
        <View style={styles.centerLabel}>
          <Text style={[styles.percent, { color }]}>{Math.round(clamped * 100)}%</Text>
        </View>
      )}
      <Animated.View style={[styles.hiddenMeasure, widthStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
  },
  bottleNeck: {
    width: "28%",
    height: "10%",
    borderWidth: 3,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  bottle: {
    width: "70%",
    height: "78%",
    borderWidth: 3,
    borderRadius: 14,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  waterFill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  centerLabel: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  percent: {
    fontSize: 24,
    fontWeight: "800",
  },
  hiddenMeasure: {
    height: 0,
    opacity: 0,
  },
});
