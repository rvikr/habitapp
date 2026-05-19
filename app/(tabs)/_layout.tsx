import { Tabs } from "expo-router";
import { useColorScheme, Platform } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "@/components/language-provider";

const TAB_ACTIVE = "#F26B1F";
const TAB_ACTIVE_DARK = "#F26B1F";
const TAB_INACTIVE = "#8F8A82";
const TAB_INACTIVE_DARK = "#7A7E88";

export default function TabsLayout() {
  const scheme = useColorScheme();
  const { t } = useLanguage();
  const isDark = scheme === "dark";
  const active = isDark ? TAB_ACTIVE_DARK : TAB_ACTIVE;
  const inactive = isDark ? TAB_INACTIVE_DARK : TAB_INACTIVE;
  const tabBarBg = isDark ? "#16161C" : "#FFFFFF";

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
          paddingBottom: Platform.OS === "ios" ? 20 : 8,
          paddingTop: 8,
          height: Platform.OS === "ios" ? 80 : 60,
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
        name="sleep"
        options={{
          title: t("Sleep"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="sleep" size={size} color={color} />
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
