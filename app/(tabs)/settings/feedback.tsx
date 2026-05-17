import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { submitFeedback, type FeedbackCategory } from "@/lib/feedback";

const CATEGORIES: Array<{ id: FeedbackCategory; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { id: "bug", label: "Bug", icon: "bug-outline" },
  { id: "idea", label: "Idea", icon: "lightbulb-on-outline" },
  { id: "usability", label: "Usability", icon: "gesture-tap" },
  { id: "other", label: "Other", icon: "message-text-outline" },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [rating, setRating] = useState(4);
  const [message, setMessage] = useState("");
  const [includeEmail, setIncludeEmail] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSending(true);
    setError(null);
    const result = await submitFeedback({ category, rating, message, includeEmail });
    setSending(false);

    if (!result.ok) {
      setError(result.error ?? "Could not send feedback.");
      return;
    }

    setMessage("");
    Alert.alert("Feedback sent", "Thanks. Your report was saved for review.", [
      { text: "Done", onPress: () => router.back() },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-md">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="text-headline-md text-on-background dark:text-d-on-background">Send Feedback</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-margin-mobile gap-md">
          <View>
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">TYPE</Text>
            <View className="flex-row flex-wrap gap-sm">
              {CATEGORIES.map((item) => {
                const active = category === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setCategory(item.id)}
                    className={`flex-row items-center px-md py-sm rounded-xl ${active ? "bg-primary" : "bg-surface-container dark:bg-d-surface-container"}`}
                  >
                    <MaterialCommunityIcons name={item.icon} size={18} color={active ? "#fff" : "#F26B1F"} />
                    <Text className={`ml-xs text-label-lg ${active ? "text-on-primary" : "text-on-surface dark:text-d-on-surface"}`}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View>
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">OVERALL RATING</Text>
            <View className="flex-row gap-xs">
              {[1, 2, 3, 4, 5].map((value) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setRating(value)}
                  className={`flex-1 h-11 rounded-xl items-center justify-center ${rating >= value ? "bg-primary" : "bg-surface-container dark:bg-d-surface-container"}`}
                >
                  <MaterialCommunityIcons name="star" size={20} color={rating >= value ? "#fff" : "#8F8A82"} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">WHAT HAPPENED?</Text>
            <TextInput
              className="min-h-36 bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
              placeholder="Tell us what you tried, what happened, and what you expected."
              placeholderTextColor="#8F8A82"
              value={message}
              onChangeText={setMessage}
              multiline
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mt-xs text-right">
              {message.length}/2000
            </Text>
          </View>

          <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-center justify-between">
            <View className="flex-1 mr-md">
              <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">Include email</Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                Lets us follow up if we need more details.
              </Text>
            </View>
            <Switch
              value={includeEmail}
              onValueChange={setIncludeEmail}
              trackColor={{ false: "#E6E0D5", true: "#F26B1F" }}
              thumbColor="#fff"
            />
          </View>

          {error && <Text className="text-error text-label-sm text-center">{error}</Text>}

          <TouchableOpacity className="bg-primary rounded-full py-sm items-center" onPress={handleSubmit} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text className="text-on-primary text-label-lg font-semibold">Send feedback</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
