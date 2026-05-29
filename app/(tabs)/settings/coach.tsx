import { useCallback, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getCurrentUser, supabase } from "@/lib/supabase/client";
import { updateCoachTone } from "@/lib/data/actions";
import { normalizeCoachTone, type CoachTone } from "@/lib/coach/coach";
import { useLanguage } from "@/components/language-provider";
import { getCurrentProAccess } from "@/lib/subscription/revenuecat";
import { ProUpgradeBanner } from "@/components/pro-access-banner";

const TONES: { id: CoachTone; label: string; sample: string }[] = [
  { id: "friendly", label: "Friendly", sample: "You can still make progress today." },
  { id: "motivational", label: "Motivational", sample: "Build momentum with one strong step." },
  { id: "calm", label: "Calm", sample: "A smaller version counts." },
  { id: "strict", label: "Strict", sample: "Commit before the day gets away." },
  { id: "military", label: "Military discipline", sample: "Mission: complete the next step." },
];

export default function CoachSettingsScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [tone, setTone] = useState<CoachTone>("friendly");
  const [saving, setSaving] = useState<CoachTone | null>(null);
  const [hasPro, setHasPro] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const access = await getCurrentProAccess();
    setHasPro(access.hasPro);
    if (!access.hasPro) {
      return;
    }
    const user = await getCurrentUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("coach_tone")
      .eq("user_id", user.id)
      .maybeSingle();
    setTone(normalizeCoachTone(data?.coach_tone as string | null | undefined));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSelect(nextTone: CoachTone) {
    setTone(nextTone);
    setSaving(nextTone);
    const result = await updateCoachTone(nextTone);
    setSaving(null);
    if (!result.ok) {
      Alert.alert(t("Could not update coach"), result.error ?? t("Try again."));
      load();
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-md">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="text-headline-md text-on-background dark:text-d-on-background">
          {t("AI Coach")}
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-margin-mobile gap-sm">
          {hasPro === false ? (
            <ProUpgradeBanner
              title="Unlock AI Coach"
              body="Subscribe to adjust coach tone and use Pro AI guidance."
              actionLabel="View plans"
              onAction={() => router.push("/pro" as never)}
            />
          ) : null}
          {hasPro !== false && TONES.map((item) => {
            const active = tone === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => handleSelect(item.id)}
                className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-center gap-md"
                style={{ borderWidth: 2, borderColor: active ? "#F26B1F" : "transparent" }}
              >
                <MaterialCommunityIcons
                  name={active ? "radiobox-marked" : "radiobox-blank"}
                  size={22}
                  color={active ? "#F26B1F" : "#8F8A82"}
                />
                <View className="flex-1">
                  <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                    {t(item.label)}
                  </Text>
                  <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                    {t(item.sample)}
                  </Text>
                </View>
                {saving === item.id && (
                  <Text className="text-label-sm text-primary">{t("Saving")}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
