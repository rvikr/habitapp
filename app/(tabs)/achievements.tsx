import { useState, useCallback } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { getStats, getMilestones } from "@/lib/data/habits";
import { BADGE_DEFS, type ComputedBadge } from "@/lib/coach/badges";
import BadgeGrid from "@/components/badge-grid";
import ShareCardModal, { type ShareCardData } from "@/components/share-card-modal";
import Skeleton, { SkeletonText } from "@/components/skeleton";
import { ProUpgradeBanner } from "@/components/pro-access-banner";
import { useLanguage } from "@/components/language-provider";
import { getCurrentProAccess } from "@/lib/subscription/revenuecat";
import { formatReportWeekRange, getLatestProgressReport } from "@/lib/data/progress-reports";
import type { Milestone, WeeklyProgressReport } from "@/types/db";

type StatsData = Awaited<ReturnType<typeof getStats>>;

export default function AchievementsScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [stats, setStats] = useState<StatsData>(null);
  const [badges, setBadges] = useState<ComputedBadge[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [report, setReport] = useState<WeeklyProgressReport | null>(null);
  const [hasPro, setHasPro] = useState<boolean | null>(null);

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      const [s, access, latestReport] = await Promise.all([
        getStats(options),
        getCurrentProAccess(),
        getLatestProgressReport(options),
      ]);
      setStats(s);
      setHasPro(access.hasPro);
      setReport(latestReport);
      if (s) {
        const computed: ComputedBadge[] = BADGE_DEFS.map((def) => ({
          id: def.id,
          name: t(def.name),
          description: t(def.description),
          icon: def.icon,
          tone: def.tone,
          earned: def.check(s),
          progressPct: def.progress(s),
          hintText: def.hint(s),
        }));
        setBadges(computed);
      }
      setMilestones(getMilestones(s));
      setLoaded(true);
    },
    [t],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ force: true });
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
            {t("Achievements")}
          </Text>
        </View>

        {/* Level / XP banner */}
        {loaded ? (
          <View className="mx-margin-mobile mb-lg bg-surface-container dark:bg-d-surface-container rounded-xl p-lg">
            <View className="flex-row justify-between items-center mb-sm">
              <Text className="text-label-lg text-on-surface dark:text-d-on-surface">
                {t("Level {level}", { level: stats?.level ?? 1 })}
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
                  {t("completions")}
                </Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-headline-md text-secondary font-bold">
                  {stats?.currentStreak ?? 0}
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  {t("day streak")}
                </Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-headline-md text-tertiary font-bold">
                  {stats?.totalHabits ?? 0}
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  {t("habits")}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <AchievementsSummarySkeleton />
        )}

        {/* Weekly AI progress report (Pro) */}
        <View className="px-margin-mobile mb-lg">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-md">
            {t("WEEKLY REPORT")}
          </Text>
          {loaded ? (
            <WeeklyReportCard
              report={report}
              hasPro={hasPro}
              t={t}
              onUpgrade={() => router.push("/pro")}
            />
          ) : (
            <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-xs">
              <SkeletonText width={120} />
              <SkeletonText width="90%" />
              <SkeletonText width="70%" />
            </View>
          )}
        </View>

        {/* Badges */}
        <View className="px-margin-mobile mb-lg">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-md">
            {t("BADGES")}
          </Text>
          {loaded ? <BadgeGrid badges={badges} onShare={handleShareBadge} /> : <BadgeSkeleton />}
        </View>

        {/* Milestones */}
        {milestones.length > 0 && (
          <View className="px-margin-mobile">
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-md">
              {t("MILESTONES")}
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

function AchievementsSummarySkeleton() {
  return (
    <View className="mx-margin-mobile mb-lg bg-surface-container dark:bg-d-surface-container rounded-xl p-lg gap-md">
      <View className="flex-row justify-between">
        <SkeletonText width={84} />
        <SkeletonText width={96} />
      </View>
      <Skeleton className="h-2 rounded-full" />
      <View className="flex-row gap-lg">
        {[0, 1, 2].map((item) => (
          <View key={item} className="flex-1 items-center gap-xs">
            <SkeletonText className="h-7" width={44} />
            <SkeletonText className="h-3" width={72} />
          </View>
        ))}
      </View>
    </View>
  );
}

function WeeklyReportCard({
  report,
  hasPro,
  t,
  onUpgrade,
}: {
  report: WeeklyProgressReport | null;
  hasPro: boolean | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onUpgrade: () => void;
}) {
  if (hasPro === false) {
    return (
      <ProUpgradeBanner
        title="Unlock weekly AI reports"
        body="Subscribe to get a personalised summary every Monday."
        actionLabel="View plans"
        onAction={onUpgrade}
      />
    );
  }

  if (!report) {
    return (
      <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-xs">
        <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
          {t("Your first report is on the way")}
        </Text>
        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
          {t("We'll generate a summary every Monday based on the previous week's habits.")}
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-xs">
      <Text className="text-label-sm text-primary font-semibold">
        {formatReportWeekRange(report.week_start)}
      </Text>
      <Text className="text-body-md text-on-surface dark:text-d-on-surface leading-6">
        {report.summary_text}
      </Text>
    </View>
  );
}

function BadgeSkeleton() {
  return (
    <View className="flex-row flex-wrap gap-sm">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <View
          key={item}
          className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-xs"
          style={{ width: "31%" }}
        >
          <Skeleton className="w-10 h-10 rounded-full" />
          <SkeletonText className="h-3" width="80%" />
          <SkeletonText className="h-3" width="58%" />
        </View>
      ))}
    </View>
  );
}
