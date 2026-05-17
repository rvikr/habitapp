import { useState, useCallback } from "react";
import Constants from "expo-constants";
import { requestReviewManually } from "@/lib/platform/store-review";
import {
  Alert,
  Linking,
  Platform,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase, getCurrentUser } from "@/lib/supabase/client";
import { signOut } from "@/lib/data/actions";
import { avatarFromUser } from "@/lib/utils/avatar";
import { useTheme } from "@/components/theme-provider";

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL;
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
const APP_VERSION = Constants.expoConfig?.version ?? "—";

type UserInfo = { displayName: string; email: string | null; avatarUrl: string };

function SettingsRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center px-md py-sm bg-surface-container dark:bg-d-surface-container rounded-xl mb-xs"
      onPress={onPress}
    >
      <MaterialCommunityIcons name={icon as any} size={20} color={danger ? "#FF5A5A" : "#F26B1F"} />
      <Text
        className={`flex-1 ml-md text-body-md ${danger ? "text-error" : "text-on-surface dark:text-d-on-surface"}`}
      >
        {label}
      </Text>
      {!danger && <MaterialCommunityIcons name="chevron-right" size={20} color="#8F8A82" />}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colorScheme, toggle } = useTheme();
  const [user, setUser] = useState<UserInfo | null>(null);

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (u) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", u.id)
        .maybeSingle();
      setUser({
        displayName:
          (profile?.display_name as string | null | undefined) ??
          (u.user_metadata?.full_name as string | undefined) ??
          u.email?.split("@")[0] ??
          "there",
        email: u.email ?? null,
        avatarUrl: avatarFromUser(u),
      });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSignOut() {
    if (Platform.OS === "web") {
      // Alert.alert buttons don't fire on web — use browser confirm instead.
      if (window.confirm("Sign out? You can sign back in any time.")) signOut();
      return;
    }
    Alert.alert("Sign out?", "You can sign back in any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-margin-mobile pt-md pb-sm">
          <Text className="text-headline-lg text-on-background dark:text-d-on-background">
            Settings
          </Text>
        </View>

        {/* Profile card */}
        <TouchableOpacity
          className="mx-margin-mobile mb-lg flex-row items-center bg-surface-container dark:bg-d-surface-container rounded-xl p-md"
          onPress={() => router.push("/settings/profile")}
        >
          {user?.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              className="w-14 h-14 rounded-full"
              resizeMode="cover"
            />
          ) : (
            <View className="w-14 h-14 rounded-full bg-primary-fixed items-center justify-center">
              <MaterialCommunityIcons name="account" size={28} color="#F26B1F" />
            </View>
          )}
          <View className="flex-1 ml-md">
            <Text className="text-body-lg text-on-surface dark:text-d-on-surface font-semibold">
              {user?.displayName}
            </Text>
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
              {user?.email}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#8F8A82" />
        </TouchableOpacity>

        {/* Appearance */}
        <View className="px-margin-mobile mb-lg">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">
            APPEARANCE
          </Text>
          <TouchableOpacity
            className="flex-row items-center px-md py-sm bg-surface-container dark:bg-d-surface-container rounded-xl"
            onPress={toggle}
          >
            <MaterialCommunityIcons
              name={colorScheme === "dark" ? "weather-night" : "weather-sunny"}
              size={20}
              color="#F26B1F"
            />
            <Text className="flex-1 ml-md text-body-md text-on-surface dark:text-d-on-surface">
              {colorScheme === "dark" ? "Dark mode" : "Light mode"}
            </Text>
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
              Toggle
            </Text>
          </TouchableOpacity>
        </View>

        {/* Account */}
        <View className="px-margin-mobile mb-lg">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">
            ACCOUNT
          </Text>
          <SettingsRow
            icon="bell"
            label="Reminders"
            onPress={() => router.push("/settings/reminders")}
          />
          <SettingsRow
            icon="message-text-outline"
            label="AI Coach"
            onPress={() => router.push("/settings/coach")}
          />
          <SettingsRow
            icon="message-alert-outline"
            label="Send Feedback"
            onPress={() => router.push("/settings/feedback" as never)}
          />
          <SettingsRow
            icon="star-outline"
            label="Rate Lagan"
            onPress={() => requestReviewManually()}
          />
          <SettingsRow
            icon="email-outline"
            label="Contact Support"
            onPress={() => {
              if (!SUPPORT_EMAIL) {
                Alert.alert("Not configured", "Set EXPO_PUBLIC_SUPPORT_EMAIL in your environment.");
                return;
              }
              Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
            }}
          />
          <SettingsRow
            icon="shield-lock"
            label="Security"
            onPress={() => router.push("/settings/security")}
          />
          <SettingsRow
            icon="database-lock"
            label="Privacy & Data"
            onPress={() => router.push("/settings/privacy" as never)}
          />
          <SettingsRow
            icon="file-document-outline"
            label="Terms & Conditions"
            onPress={() => {
              if (!TERMS_URL) {
                Alert.alert("Not configured", "Set EXPO_PUBLIC_TERMS_URL in your environment.");
                return;
              }
              Linking.openURL(TERMS_URL);
            }}
          />
        </View>

        {/* Danger */}
        <View className="px-margin-mobile">
          <SettingsRow icon="logout" label="Sign out" onPress={handleSignOut} danger />
        </View>

        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant text-center mt-lg">
          Version {APP_VERSION}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
