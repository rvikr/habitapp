import { Text, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "@/components/language-provider";

type ProUpgradeBannerProps = {
  title?: string;
  titleValues?: Record<string, string | number>;
  body?: string;
  bodyValues?: Record<string, string | number>;
  actionLabel?: string;
  onAction: () => void;
  onDismiss?: () => void;
};

export function ProUpgradeBanner({
  title = "Unlock Pro",
  titleValues,
  body = "Subscribe to keep using this Pro feature.",
  bodyValues,
  actionLabel = "View plans",
  onAction,
  onDismiss,
}: ProUpgradeBannerProps) {
  const { t } = useLanguage();
  return (
    <View className="bg-surface-container dark:bg-d-surface rounded-2xl border border-outline-variant dark:border-d-outline-variant p-md gap-sm">
      <View className="flex-row items-start gap-md">
        <View className="w-10 h-10 rounded-full bg-primary items-center justify-center">
          <MaterialCommunityIcons name="star-four-points" size={20} color="#fff" />
        </View>
        <View className="flex-1 gap-xs">
          <Text className="text-body-md text-on-background dark:text-d-on-background font-semibold">
            {t(title, titleValues)}
          </Text>
          <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
            {t(body, bodyValues)}
          </Text>
        </View>
        {onDismiss ? (
          <TouchableOpacity
            className="w-8 h-8 rounded-full items-center justify-center"
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t("Dismiss")}
          >
            <MaterialCommunityIcons name="close" size={18} color="#8F8A82" />
          </TouchableOpacity>
        ) : null}
      </View>
      <TouchableOpacity
        className="self-start bg-primary rounded-full px-md py-xs"
        onPress={onAction}
        accessibilityRole="button"
      >
        <Text className="text-on-primary text-label-lg font-semibold">{t(actionLabel)}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function TrialEndedBanner({
  onAction,
  onDismiss,
}: {
  onAction: () => void;
  onDismiss: () => void;
}) {
  return (
    <ProUpgradeBanner
      title="Your Pro trial has ended"
      body="Your habits, streaks, and data are safe. AI Coach, smart reminders, and weekly reports are paused until you subscribe."
      actionLabel="View plans"
      onAction={onAction}
      onDismiss={onDismiss}
    />
  );
}

export function TrialSubscriptionBanner({
  daysLeft,
  onAction,
  onDismiss,
}: {
  daysLeft: number;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const title = daysLeft === 1 ? "1 day of Pro left" : "{count} days of Pro left";
  return (
    <ProUpgradeBanner
      title={title}
      titleValues={{ count: daysLeft }}
      body="Subscribe to keep AI Coach, routine refinement, smart reminders, and weekly reports after your trial."
      actionLabel="View plans"
      onAction={onAction}
      onDismiss={onDismiss}
    />
  );
}
