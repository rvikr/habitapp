import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getCurrentUser } from "@/lib/supabase/client";
import { updateAvatar } from "@/lib/data/actions";
import { type AvatarStyle } from "@/lib/utils/avatar";
import AvatarPicker from "@/components/avatar-picker";

export default function ProfileScreen() {
  const router = useRouter();
  const [style, setStyle] = useState<AvatarStyle>("avataaars");
  const [seed, setSeed] = useState("Aspen");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getCurrentUser();
      if (cancelled || !user) return;
      setStyle((user.user_metadata?.avatar_style as AvatarStyle) ?? "avataaars");
      setSeed((user.user_metadata?.avatar_seed as string) ?? user.id.slice(0, 12));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setLoading(true);
    await updateAvatar(style, seed);
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-md">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="text-headline-md text-on-background dark:text-d-on-background">
          Edit Profile
        </Text>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <AvatarPicker style={style} seed={seed} onStyleChange={setStyle} onSeedChange={setSeed} />
        <View className="px-margin-mobile mt-lg">
          <TouchableOpacity
            className="bg-primary rounded-full py-sm items-center"
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-on-primary text-label-lg font-semibold">
                {saved ? "Saved!" : "Save changes"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
