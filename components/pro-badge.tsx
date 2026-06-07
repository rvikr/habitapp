import type { ComponentProps } from "react";
import { Text, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useLanguage } from "@/components/language-provider";
import type { ProAccess } from "@/lib/subscription/access";

const PRIMARY = "#F26B1F";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

type Props = {
  access: ProAccess;
};

export default function ProBadge({ access }: Props) {
  const router = useRouter();
  const { t } = useLanguage();

  let icon: IconName = "star-four-points";
  let label = t("Free");
  if (access.source === "admin" || access.source === "subscription") {
    icon = "star-four-points";
    label = t("Pro");
  } else if (access.source === "trial") {
    icon = "clock-outline";
    label = access.trialDaysLeft != null ? `${t("Trial")} · ${access.trialDaysLeft}d` : t("Trial");
  } else {
    icon = "arrow-up-circle-outline";
    label = t("Free");
  }

  return (
    <TouchableOpacity
      className="bg-primary-fixed flex-row items-center gap-1 px-sm rounded-full"
      style={{ paddingVertical: 3 }}
      onPress={() => router.push("/pro" as never)}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={10} color={PRIMARY} />
      <Text style={{ color: PRIMARY, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}
