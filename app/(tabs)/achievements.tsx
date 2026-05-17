import { useState, useCallback } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { getStats, getMilestones } from "@/lib/data/habits";
import { BADGE_DEFS, type ComputedBadge } from "@/lib/coach/badges";
import BadgeGrid from "@/components/badge-grid";
import ShareCardModal, { type ShareCardData } from "@/components/share-card-modal";
import type { Milestone } from "@/types/db";

type StatsData = Awaited<ReturnType<typeof getStats>>;

export default function AchievementsScreen() {
  const [stats, setStats] = useState<StatsData>(null);
  const [badges, setBadges] = useState<ComputedBadge[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);

  const load = useCallback(async () => {
    const s = await getStats();
    setStats(s);
    if (s) {
      const computed: ComputedBadge[] = BADGE_DEFS.map((def) => ({
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        tone: def.tone,
        earned: def.check(s),
        progressPct: def.progress(s),
        hintText: def.hint(s),
      }));
      setBadges(computed);
    }
    setMilestones(getMilestones(s));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleShareBadge = useCallback((badge: ComputedBadge) => {
    setShareData({
      kind: "badge",
      id: badge.id,
      name: badge.name,
      description: badge.description,
      tone: badge.tone,
    });
  }, []);

  const xpPct = stats ? (stats.xp / stats.xpForNext) * 100 : 0;

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="px-margin-mobile pt-md pb-sm">
          <Text className="text-headline-lg text-on-background dark:text-d-on-background">
            Achievements
          </Text>
        </View>

        {/* Level / XP banner */}
        <View className="mx-margin-mobile mb-lg bg-surface-container dark:bg-d-surface-container rounded-xl p-lg">
          <View className="flex-row justify-between items-center mb-sm">
            <Text className="text-label-lg text-on-surface dark:text-d-on-surface">
              Level {stats?.level ?? 1}
            </Text>
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
              {stats?.xp ?? 0} / {stats?.xpForNext ?? 500} XP
            </Text>
          </View>
          <View className="h-2 bg-surface-high dark:bg-d-surface-high rounded-full overflow-hidden">
            <View className="h-full bg-primary rounded-full" style={{ width: `${xpPct}%` }} />
          </View>
          <View className="flex-row mt-md gap-lg">
            <View className="flex-1 items-center">
              <Text className="text-headline-md text-primary font-bold">
                {stats?.totalCompletions ?? 0}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                completions
              </Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-headline-md text-secondary font-bold">
                {stats?.currentStreak ?? 0}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                day streak
              </Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-headline-md text-tertiary font-bold">
                {stats?.totalHabits ?? 0}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                habits
              </Text>
            </View>
          </View>
        </View>

        {/* Badges */}
        <View className="px-margin-mobile mb-lg">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-md">
            BADGES
          </Text>
          <BadgeGrid badges={badges} onShare={handleShareBadge} />
        </View>

        {/* Milestones */}
        {milestones.length > 0 && (
          <View className="px-margin-mobile">
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-md">
              MILESTONES
            </Text>
            {milestones.map((m) => (
              <View
                key={m.id}
                className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md mb-sm"
              >
                <View className="flex-row justify-between mb-xs">
                  <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                    {m.name}
                  </Text>
                  <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                    {Math.round(m.progress * 100)}%
                  </Text>
                </View>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mb-sm">
                  {m.description}
                </Text>
                <View className="h-2 bg-surface-high dark:bg-d-surface-high rounded-full overflow-hidden">
                  <View
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${m.progress * 100}%` }}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <ShareCardModal data={shareData} onClose={() => setShareData(null)} />
    </SafeAreaView>
  );
}
