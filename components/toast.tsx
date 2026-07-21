import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { impact } from "@/lib/platform/haptics";
import { useTheme } from "@/components/theme-provider";

// High-contrast "snackbar" pill colors, set inline (not via NativeWind classes)
// so the toast is guaranteed legible in both themes regardless of which utility
// classes the bundler has generated. Light: dark inverse surface; dark: an
// elevated surface that lifts off the near-black background.
const PILL_BG_LIGHT = "#2E2926"; // inverse-surface
const PILL_BG_DARK = "#353540"; // d-surface-highest
const PILL_TEXT = "#FFFFFF";
const PILL_DETAIL = "rgba(255, 255, 255, 0.78)";
const CHECK_GREEN = "#3EBB7F"; // secondary

const TOAST_DURATION_MS = 1800;

type Ctx = { toast: (message: string, detail?: string) => void };
const ToastContext = createContext<Ctx>({ toast: () => {} });

/**
 * Lightweight, non-blocking bottom snackbar for routine confirmations (e.g. a
 * partial quantity log). Unlike {@link CelebrationProvider} it never fires
 * confetti and uses the softer `impact()` haptic — the confetti celebration
 * stays reserved for actually completing a goal.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useTheme();
  const isDark = colorScheme === "dark";
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<string | undefined>(undefined);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // RN Web has no native animated module — the JS driver keeps opacity/transform
  // animating without the "useNativeDriver is not supported" console warning.
  const useNativeDriver = Platform.OS !== "web";

  function toast(msg: string, detailText?: string) {
    setMessage(msg);
    setDetail(detailText);
    setVisible(true);
    impact();
    opacity.stopAnimation();
    translateY.stopAnimation();
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver }),
      Animated.timing(translateY, { toValue: 0, duration: 160, useNativeDriver }),
    ]).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver }),
        Animated.timing(translateY, { toValue: 12, duration: 200, useNativeDriver }),
      ]).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }, TOAST_DURATION_MS);
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {visible && (
        <View style={[StyleSheet.absoluteFill, styles.overlay]}>
          <Animated.View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="flex-row items-center gap-sm rounded-2xl px-lg py-md"
            style={{
              maxWidth: "92%",
              marginBottom: insets.bottom + 72,
              // Layout pinned inline (not just via classes) so the leading icon
              // stays vertically centered regardless of generated utilities.
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: isDark ? PILL_BG_DARK : PILL_BG_LIGHT,
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
              opacity,
              transform: [{ translateY }],
            }}
          >
            <MaterialCommunityIcons name="check-circle" size={22} color={CHECK_GREEN} />
            <View className="shrink">
              <Text className="text-body-md font-semibold" style={{ color: PILL_TEXT }}>
                {message}
              </Text>
              {detail ? (
                <Text className="text-label-sm" style={{ color: PILL_DETAIL }}>
                  {detail}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).toast;
}

const styles = StyleSheet.create({
  // `pointerEvents` lives in the style object (not a prop) — the prop form is
  // deprecated on React Native Web and is linted against in the test suite.
  overlay: {
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 1000,
    pointerEvents: "none",
  },
});
