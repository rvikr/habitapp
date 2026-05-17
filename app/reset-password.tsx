import { useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { updatePassword } from "@/lib/data/actions";
import { validatePassword } from "@/lib/auth/password";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);

  async function handleSave() {
    if (password !== confirm) {
      setMessage({ text: "Passwords do not match.", type: "error" });
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      setMessage({ text: pwError, type: "error" });
      return;
    }

    setLoading(true);
    setMessage(null);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) {
      setMessage({ text: error.message, type: "error" });
      return;
    }
    setMessage({ text: "Password updated.", type: "success" });
    setTimeout(() => router.replace("/"), 800);
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background justify-center px-margin-mobile">
      <View className="gap-sm">
        <Text className="text-headline-lg text-on-background dark:text-d-on-background font-bold">
          Set a new password
        </Text>
        <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant mb-md">
          Use at least 8 characters with uppercase, lowercase, and a number.
        </Text>
        <TextInput
          className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
          placeholder="New password"
          placeholderTextColor="#8F8A82"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
        />
        <TextInput
          className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
          placeholder="Confirm new password"
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
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-on-primary text-label-lg font-semibold">Update password</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
