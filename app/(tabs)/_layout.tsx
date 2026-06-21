import { useEffect, useState } from "react";
import { Redirect, Tabs } from "expo-router";
import { useColorScheme, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "@/components/language-provider";
import { getCurrentSession } from "@/lib/supabase/client";

const TAB_ACTIVE = "#F26B1F";
const TAB_ACTIVE_DARK = "#F26B1F";
const TAB_INACTIVE = "#8F8A82";
const TAB_INACTIVE_DARK = "#7A7E88";

export default function TabsLayout() {
  const scheme = useColorScheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const isDark = scheme === "dark";
  const active = isDark ? TAB_ACTIVE_DARK : TAB_ACTIVE;
  const inactive = isDark ? TAB_INACTIVE_DARK : TAB_INACTIVE;
  const tabBarBg = isDark ? "#16161C" : "#FFFFFF";
  // Once we override tabBarStyle.height/paddingBottom, React Navigation stops
  // auto-applying the safe-area inset, so we must add it back ourselves. This
  // matters on Android gesture-nav devices (the nav pill overlapped the tabs,
  // making them hard to tap) and in the installed iOS PWA, where Platform.OS is
  // "web" and the iOS branch never runs (CSS env(), viewport-fit=cover). iOS
  // native keeps its existing hand-tuned padding.
  const bottomInset = Platform.OS === "ios" ? 0 : insets.bottom;

  useEffect(() => {
    let mounted = true;
    void getCurrentSession().then((session) => {
      if (!mounted) return;
      setHasSession(Boolean(session));
      setSessionChecked(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!sessionChecked) return null;
  if (!hasSession) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: active,
        tabBarInactiveTintColor: inactive,
        tabBarStyle: {
          backgroundColor: tabBarBg,
          borderTopColor: isDark ? "#2C2C36" : "#E6E0D5",
          borderTopWidth: 1,
          paddingBottom: (Platform.OS === "ios" ? 20 : 8) + bottomInset,
          paddingTop: 8,
          // Web needs ~70px: each item spends ~28px on the icon block and ~10px
          // on its own padding, so at 60 the label row collapsed to 5px and
          // clipped. (Auto height drops the labels entirely on web.)
          height: (Platform.OS === "ios" ? 80 : Platform.OS === "web" ? 70 : 60) + bottomInset,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("Today"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="achievements"
        options={{
          title: t("Badges"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="trophy" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t("Progress"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-line" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: t("Ranks"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="podium" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("Settings"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
