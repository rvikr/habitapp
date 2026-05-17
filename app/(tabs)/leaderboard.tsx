import { useState, useCallback } from "react";
import {
  Alert,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  getLeaderboard,
  getMyProfile,
  setDisplayName,
  getMyRank,
  type LeaderboardEntry,
  type Profile,
} from "@/lib/data/leaderboard";
import { avatarUrl, type AvatarStyle } from "@/lib/utils/avatar";
import ShareCardModal, { type ShareCardData } from "@/components/share-card-modal";

export default function LeaderboardScreen() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showOptIn, setShowOptIn] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);

  const load = useCallback(async () => {
    const [board, prof, rank] = await Promise.all([
      getLeaderboard(50),
      getMyProfile(),
      getMyRank(),
    ]);
    setEntries(board);
    setProfile(prof);
    setMyRank(rank);
    if (prof?.display_name) setNameInput(prof.display_name);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleOptIn() {
    const trimmed = nameInput.trim();
    if (trimmed.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    if (trimmed.length > 30) {
      setError("Name must be at most 30 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await setDisplayName(trimmed);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save");
      return;
    }
    setShowOptIn(false);
    load();
  }

  async function handleOptOut() {
    Alert.alert(
      "Leave leaderboard?",
      "Your display name and stats will no longer be shown to other users.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            await setDisplayName(null);
            setSaving(false);
            setShowOptIn(false);
            load();
          },
        },
      ],
    );
  }

  const optedIn = profile?.display_name != null;

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="px-margin-mobile pt-md pb-sm flex-row items-center justify-between">
          <Text className="text-headline-lg text-on-background dark:text-d-on-background">
            Leaderboard
          </Text>
          <TouchableOpacity
            onPress={() => {
              setNameInput(profile?.display_name ?? "");
              setShowOptIn(true);
            }}
            className="p-xs"
          >
            <MaterialCommunityIcons name="account-edit" size={22} color="#F26B1F" />
          </TouchableOpacity>
        </View>

        {!optedIn && (
          <TouchableOpacity
            onPress={() => setShowOptIn(true)}
            className="mx-margin-mobile mb-lg bg-primary-fixed rounded-xl p-md flex-row items-center gap-md"
          >
            <MaterialCommunityIcons name="trophy-award" size={24} color="#F26B1F" />
            <View className="flex-1">
              <Text className="text-body-md text-on-background font-semibold">
                Join the leaderboard
              </Text>
              <Text className="text-label-sm text-on-surface-variant">
                Pick a display name to compete with others.
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#F26B1F" />
          </TouchableOpacity>
        )}

        {optedIn && myRank != null && (
          <View className="mx-margin-mobile mb-lg bg-primary rounded-xl p-md flex-row items-center gap-md">
            <Text className="text-headline-md text-on-primary font-bold">#{myRank}</Text>
            <View className="flex-1">
              <Text className="text-body-md text-on-primary font-semibold">Your rank</Text>
              <Text className="text-label-sm text-on-primary opacity-80">Keep going to climb!</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                const topPct =
                  entries.length > 0 ? Math.ceil((myRank / entries.length) * 100) : null;
                setShareData({ kind: "rank", rank: myRank, streak: 0, topPct });
              }}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              className="p-xs"
            >
              <MaterialCommunityIcons
                name="share-variant"
                size={20}
                color="rgba(255,255,255,0.85)"
              />
            </TouchableOpacity>
          </View>
        )}

        <View className="px-margin-mobile gap-xs">
          {entries.length === 0 ? (
            <View className="items-center py-xxl">
              <MaterialCommunityIcons name="account-group-outline" size={48} color="#8F8A82" />
              <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant mt-sm text-center">
                {optedIn
                  ? "Be the first on the board — start logging habits!"
                  : "No one's on the board yet. Opt in above to be the first."}
              </Text>
            </View>
          ) : (
            entries.map((entry, i) => (
              <LeaderboardRow
                key={entry.user_id}
                entry={entry}
                rank={i + 1}
                isMe={profile?.user_id === entry.user_id}
              />
            ))
          )}
        </View>
      </ScrollView>

      <OptInModal
        visible={showOptIn}
        nameInput={nameInput}
        setNameInput={setNameInput}
        saving={saving}
        error={error}
        optedIn={optedIn}
        onSave={handleOptIn}
        onOptOut={handleOptOut}
        onDismiss={() => {
          setShowOptIn(false);
          setError(null);
        }}
      />

      <ShareCardModal data={shareData} onClose={() => setShareData(null)} />
    </SafeAreaView>
  );
}

function LeaderboardRow({
  entry,
  rank,
  isMe,
}: {
  entry: LeaderboardEntry;
  rank: number;
  isMe: boolean;
}) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  const url = avatarUrl(entry.avatar_style as AvatarStyle | null, entry.avatar_seed);
  return (
    <View
      className={`flex-row items-center bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-md gap-md ${isMe ? "border-2 border-primary" : ""}`}
    >
      <View className="w-8 items-center">
        {medal ? (
          <Text className="text-headline-md">{medal}</Text>
        ) : (
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant font-semibold">
            {rank}
          </Text>
        )}
      </View>
      <Image
        source={{ uri: url }}
        className="w-10 h-10 rounded-full bg-primary-fixed"
        resizeMode="cover"
      />
      <View className="flex-1">
        <Text
          className="text-body-md text-on-surface dark:text-d-on-surface font-semibold"
          numberOfLines={1}
        >
          {entry.display_name}
          {isMe ? " (you)" : ""}
        </Text>
        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
          Level {entry.level} · {entry.total_completions} completions · {entry.total_habits} habits
        </Text>
      </View>
      <Text className="text-label-lg text-primary font-bold">{entry.total_xp} XP</Text>
    </View>
  );
}

function OptInModal({
  visible,
  nameInput,
  setNameInput,
  saving,
  error,
  optedIn,
  onSave,
  onOptOut,
  onDismiss,
}: {
  visible: boolean;
  nameInput: string;
  setNameInput: (s: string) => void;
  saving: boolean;
  error: string | null;
  optedIn: boolean;
  onSave: () => void;
  onOptOut: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-surface-lowest dark:bg-d-surface-lowest rounded-t-3xl p-lg gap-sm">
          <Text className="text-headline-md text-on-surface dark:text-d-on-surface font-bold">
            {optedIn ? "Update display name" : "Join the leaderboard"}
          </Text>
          <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
            Your display name will be visible to all users on the leaderboard. Pick something you're
            comfortable sharing publicly.
          </Text>
          <TextInput
            className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md mt-sm"
            placeholder="Display name (e.g. ravi-k)"
            placeholderTextColor="#8F8A82"
            value={nameInput}
            onChangeText={setNameInput}
            maxLength={30}
            autoCapitalize="none"
          />
          {error && <Text className="text-error text-label-sm">{error}</Text>}

          <TouchableOpacity
            className="bg-primary rounded-full py-sm items-center mt-sm"
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-on-primary text-label-lg font-semibold">
                {optedIn ? "Save" : "Join"}
              </Text>
            )}
          </TouchableOpacity>

          {optedIn && (
            <TouchableOpacity className="items-center py-sm" onPress={onOptOut} disabled={saving}>
              <Text className="text-error text-label-lg">Remove me from the leaderboard</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity className="items-center py-sm" onPress={onDismiss} disabled={saving}>
            <Text className="text-on-surface-variant dark:text-d-on-surface-variant">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
