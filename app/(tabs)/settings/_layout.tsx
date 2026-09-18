import { Stack } from "expo-router";

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="coach" />
      <Stack.Screen name="reminders" />
      <Stack.Screen name="security" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="feedback" />
      <Stack.Screen name="widget-diagnostics" />
    </Stack>
  );
}
