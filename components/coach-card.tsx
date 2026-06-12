import { useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import type { CoachSignal } from "@/lib/coach/coach";

const PRIMARY = "#F26B1F";

export function coachActionLabel(
  signal: CoachSignal,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  if (signal.suggestedAction === "log_value" && signal.suggestedValue) {
    const unit = signal.unit ? ` ${signal.unit}` : "";
    return t("Log {value}{unit}", { value: signal.suggestedValue, unit });
  }
  return t("Open");
}

type CoachCardProps = {
  signal: CoachSignal;
  hasPro: boolean;
  // "card" is the dashboard surface; "compact" is the habit-detail tip, which
  // drops the secondary Open button and hides the action entirely for signals
  // whose only suggestion is opening the habit the user is already looking at.
  variant?: "card" | "compact";
  onAction: (signal: CoachSignal) => void;
  onOpenHabit?: (habitId: string) => void;
  onDismiss: () => void;
  onUpsell?: () => void;
  upsellDismissed?: boolean;
  onUpsellDismiss?: () => void;
};

export default function CoachCard({
  signal,
  hasPro,
  variant = "card",
  onAction,
  onOpenHabit,
  onDismiss,
  onUpsell,
  upsellDismissed,
  onUpsellDismiss,
}: CoachCardProps) {
  const { t } = useLanguage();
  const compact = variant === "compact";
  const showPrimaryAction =
    !compact || (signal.suggestedAction === "log_value" && signal.suggestedValue != null);

  return (
    <View
      className={
        compact
          ? "mx-margin-mobile mb-lg rounded-2xl p-md gap-sm"
          : "mx-margin-mobile mb-sm rounded-2xl p-md gap-sm"
      }
      style={{ backgroundColor: PRIMARY }}
    >
      <View className="flex-row items-start gap-sm">
        <View
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
        >
          <MaterialCommunityIcons name="robot-happy-outline" size={18} color="#fff" />
        </View>
        <View className="flex-1">
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: "rgba(255,255,255,0.75)",
              letterSpacing: 0.5,
            }}
          >
            {t("AI COACH")}
          </Text>
          <Text style={{ fontSize: 14, color: "#fff", marginTop: 3, lineHeight: 20 }}>
            {signal.message}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t("Dismiss")}
        >
          <MaterialCommunityIcons name="close" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>
      {showPrimaryAction && (
        <View className="flex-row gap-sm">
          <TouchableOpacity
            onPress={() => onAction(signal)}
            className="flex-1 rounded-full py-sm items-center"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
          >
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
              {coachActionLabel(signal, t)}
            </Text>
          </TouchableOpacity>
          {!compact &&
            signal.suggestedAction === "log_value" &&
            signal.suggestedValue != null &&
            onOpenHabit && (
              <TouchableOpacity
                onPress={() => onOpenHabit(signal.habitId)}
                className="flex-1 rounded-full py-sm items-center"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
              >
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{t("Open")}</Text>
              </TouchableOpacity>
            )}
        </View>
      )}
      {!hasPro && !upsellDismissed && onUpsell ? (
        <View
          className="flex-row items-center gap-xs rounded-full px-sm py-xs"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
        >
          <TouchableOpacity
            className="flex-1 flex-row items-center gap-xs"
            onPress={onUpsell}
            accessibilityRole="button"
            accessibilityLabel={t("Personalized AI coaching with Pro")}
          >
            <MaterialCommunityIcons name="star-four-points" size={14} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600", flex: 1 }}>
              {t("Personalized AI coaching with Pro")}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          {onUpsellDismiss ? (
            <TouchableOpacity
              onPress={onUpsellDismiss}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t("Dismiss")}
            >
              <MaterialCommunityIcons name="close" size={14} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type CoachHeaderButtonProps = {
  signal: CoachSignal | null;
  // The signal's habit is not completed today — same condition that used to
  // drive the badge dot and icon tint.
  active: boolean;
  cardVisible: boolean;
  onPress: () => void;
};

// Header bot button. While an attention-worthy signal is hidden (card dismissed
// or collapsed) it expands into a pulsing pill previewing the coach message, so
// the coach stays discoverable without permanently occupying the dashboard.
export function CoachHeaderButton({
  signal,
  active,
  cardVisible,
  onPress,
}: CoachHeaderButtonProps) {
  const { colorScheme } = useTheme();
  const attention = active && !!signal && signal.kind !== "encouragement";
  const previewing = attention && !cardVisible;
  const scale = useSharedValue(1);

  useEffect(() => {
    if (previewing) {
      scale.value = withRepeat(
        withSequence(withTiming(1.06, { duration: 700 }), withTiming(1, { duration: 700 })),
        -1,
      );
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 150 });
    }
    return () => cancelAnimation(scale);
  }, [previewing, scale]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: ((scale.value - 1) / 0.06) * 0.35,
  }));

  const iconColor = active ? PRIMARY : colorScheme === "dark" ? "#e4e1ea" : "#444";

  return (
    <Animated.View style={previewing ? pulseStyle : undefined}>
      {previewing ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: -3,
              bottom: -3,
              left: -3,
              right: -3,
              borderRadius: 23,
              backgroundColor: PRIMARY,
            },
            haloStyle,
          ]}
        />
      ) : null}
      <TouchableOpacity
        className={
          previewing
            ? "h-10 rounded-full bg-surface-container dark:bg-d-surface-container flex-row items-center gap-xs px-sm"
            : "w-10 h-10 rounded-full bg-surface-container dark:bg-d-surface-container items-center justify-center"
        }
        style={previewing ? { maxWidth: 176 } : undefined}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="AI Coach"
      >
        <MaterialCommunityIcons name="robot-happy-outline" size={20} color={iconColor} />
        {previewing && signal ? (
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ color: PRIMARY, fontSize: 12, fontWeight: "600", flexShrink: 1 }}
          >
            {signal.message}
          </Text>
        ) : null}
        {active && !previewing ? (
          <View
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 9,
              height: 9,
              borderRadius: 4.5,
              backgroundColor: PRIMARY,
              borderWidth: 1.5,
              borderColor: colorScheme === "dark" ? "#16161C" : "#FFFFFF",
            }}
          />
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
}
