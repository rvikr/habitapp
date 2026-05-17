import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { requestPermission, getPermissionStatus } from "@/lib/platform/notifications";

export default function NotificationPermissionCard() {
  const [status, setStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");

  useEffect(() => {
    getPermissionStatus().then(setStatus);
  }, []);

  if (status === "granted") return null;

  return (
    <View className="bg-primary-fixed rounded-xl p-md flex-row items-center gap-md mx-margin-mobile mb-md">
      <MaterialCommunityIcons name="bell-alert" size={24} color="#F26B1F" />
      <View className="flex-1">
        <Text className="text-body-md text-on-background font-semibold">Enable notifications</Text>
        <Text className="text-label-sm text-on-surface-variant">
          {status === "denied"
            ? "Notifications blocked — enable in Settings."
            : "Allow notifications for habit reminders."}
        </Text>
      </View>
      {status !== "denied" && (
        <TouchableOpacity
          className="bg-primary px-md py-xs rounded-full"
          onPress={async () => {
            const granted = await requestPermission();
            setStatus(granted ? "granted" : "denied");
          }}
        >
          <Text className="text-on-primary text-label-sm font-semibold">Allow</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
