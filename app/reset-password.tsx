import { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { updatePassword } from "@/lib/data/actions";
import { validatePassword } from "@/lib/auth/password";
import { authErrorMessageKey } from "@/lib/supabase/auth-error";
import { useLanguage } from "@/components/language-provider";

type SessionState = "checking" | "ready" | "missing";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);

  useEffect(() => {
    let active = true;
    // The recovery link establishes a session via the /auth/callback exchange.
    // Without one, updateUser({ password }) would fail with a raw backend error,
    // so guard the form and point the user back to request a fresh link.
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSessionState(data.session ? "ready" : "missing");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setSessionState("ready");
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSave() {
    if (loading) return;
    if (password !== confirm) {
      setMessage({ text: t("Passwords do not match."), type: "error" });
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      setMessage({ text: t(pwError), type: "error" });
      return;
    }

    setLoading(true);
    setMessage(null);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) {
      setMessage({ text: t(authErrorMessageKey(error)), type: "error" });
      return;
    }
    setMessage({ text: t("Password updated."), type: "success" });
    setTimeout(() => router.replace("/"), 800);
  }

  if (sessionState === "checking") {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-d-background items-center justify-center px-margin-mobile">
        <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
          {t("Checking your reset link...")}
        </Text>
      </SafeAreaView>
    );
  }

  if (sessionState === "missing") {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-d-background justify-center px-margin-mobile">
        <View className="gap-sm">
          <Text className="text-headline-lg text-on-background dark:text-d-on-background font-bold">
            {t("Reset link expired")}
          </Text>
          <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant mb-md">
            {t(
              "This password reset link is invalid or has expired. Request a new one from the sign-in screen.",
            )}
          </Text>
          <TouchableOpacity
            className="bg-primary rounded-full py-sm items-center mt-sm"
            accessibilityRole="button"
            onPress={() => router.replace("/login")}
          >
            <Text className="text-on-primary text-label-lg font-semibold">
              {t("Back to sign in")}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background justify-center px-margin-mobile">
      <View className="gap-sm">
        <Text className="text-headline-lg text-on-background dark:text-d-on-background font-bold">
          {t("Set a new password")}
        </Text>
        <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant mb-md">
          {t("Use at least 8 characters with uppercase, lowercase, and a number.")}
        </Text>
        <TextInput
          className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
          placeholder={t("New password")}
          placeholderTextColor="#8F8A82"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
        />
        <TextInput
          className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
          placeholder={t("Confirm new password")}
          placeholderTextColor="#8F8A82"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />
        {message && (
          <Text
            className={`text-label-sm ${message.type === "error" ? "text-error" : "text-secondary"}`}
          >
            {message.text}
          </Text>
        )}
        <TouchableOpacity
          className="bg-primary rounded-full py-sm items-center mt-sm"
          accessibilityRole="button"
          onPress={handleSave}
        >
          <Text className="text-on-primary text-label-lg font-semibold">
            {loading ? t("Updating...") : t("Update password")}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
