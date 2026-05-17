import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { updatePassword } from "@/lib/actions";
import { validatePassword } from "@/lib/password";

export default function SecurityScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);

  async function handleSave() {
    if (!password) { setMessage({ text: "Password is required.", type: "error" }); return; }
    if (password !== confirm) { setMessage({ text: "Passwords do not match.", type: "error" }); return; }
    const pwError = validatePassword(password);
    if (pwError) { setMessage({ text: pwError, type: "error" }); return; }
    setLoading(true);
    setMessage(null);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) setMessage({ text: error.message, type: "error" });
    else { setMessage({ text: "Password updated!", type: "success" }); setPassword(""); setConfirm(""); }
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-md">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="text-headline-md text-on-background dark:text-d-on-background">Security</Text>
      </View>
      <View className="px-margin-mobile gap-sm mt-md">
        <TextInput
          className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
          placeholder="New password (8+ chars, mixed case + number)"
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
          <Text className={`text-label-sm ${message.type === "error" ? "text-error" : "text-secondary"}`}>{message.text}</Text>
        )}
        <TouchableOpacity
          className="bg-primary rounded-full py-sm items-center mt-sm"
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-on-primary text-label-lg font-semibold">Update password</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
