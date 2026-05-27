import { Modal, View, Text, TouchableOpacity, ScrollView } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "@/components/language-provider";
import type { HabitValidationResult } from "@/lib/habits/validate";

type Props = {
  validation: HabitValidationResult | null;
  onEdit: () => void;
  onContinue?: () => void;
  onApplySuggestion?: (suggestion: NonNullable<HabitValidationResult["suggestion"]>) => void;
};

const CATEGORY_LABEL: Record<NonNullable<HabitValidationResult["category"]>, string> = {
  policy: "Policy concern",
  unhealthy: "Health concern",
  impossible: "Unrealistic target",
};

export default function HabitValidationModal({
  validation,
  onEdit,
  onContinue,
  onApplySuggestion,
}: Props) {
  const { t } = useLanguage();
  if (!validation || validation.status === "ok" || validation.status === "uncertain") return null;

  const isBlock = validation.status === "block";
  const title = isBlock ? t("We can't track this habit") : t("Let's double-check this habit");
  const tag = validation.category ? t(CATEGORY_LABEL[validation.category]) : null;
  const message =
    validation.message ??
    (isBlock
      ? t("This habit isn't something we can help you track.")
      : t("This habit looks unusual. Are you sure you want to continue?"));
  const suggestion = validation.suggestion;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onEdit}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View className="bg-surface dark:bg-d-surface rounded-2xl p-lg gap-md">
          <View className="flex-row items-center gap-sm">
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: isBlock ? "#FF5A5A22" : "#FFC56B22",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialCommunityIcons
                name={isBlock ? "shield-alert-outline" : "alert-circle-outline"}
                size={22}
                color={isBlock ? "#FF5A5A" : "#E4A23A"}
              />
            </View>
            <View className="flex-1">
              <Text className="text-headline-sm text-on-surface dark:text-d-on-surface font-semibold">
                {title}
              </Text>
              {tag && (
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  {tag}
                </Text>
              )}
            </View>
          </View>

          <ScrollView style={{ maxHeight: 200 }}>
            <Text className="text-body-md text-on-surface dark:text-d-on-surface">{message}</Text>
          </ScrollView>

          {suggestion && onApplySuggestion && (
            <TouchableOpacity
              className="bg-primary-fixed dark:bg-d-surface-container rounded-xl px-md py-sm"
              onPress={() => onApplySuggestion(suggestion)}
            >
              <Text className="text-label-sm text-primary">{t("Suggested")}</Text>
              <Text className="text-body-md text-on-surface dark:text-d-on-surface">
                {suggestion.name ?? ""}
                {suggestion.target != null
                  ? `${suggestion.name ? " · " : ""}${suggestion.target}${suggestion.unit ?? ""}`
                  : suggestion.unit
                    ? `${suggestion.name ? " · " : ""}${suggestion.unit}`
                    : ""}
              </Text>
              <Text className="text-label-sm text-primary mt-xs">
                {t("Tap to use these values")}
              </Text>
            </TouchableOpacity>
          )}

          <View className="flex-row gap-sm mt-sm">
            <TouchableOpacity
              className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-full py-sm items-center"
              onPress={onEdit}
            >
              <Text className="text-on-surface dark:text-d-on-surface text-label-lg font-semibold">
                {t("Edit habit")}
              </Text>
            </TouchableOpacity>
            {!isBlock && onContinue && (
              <TouchableOpacity
                className="flex-1 bg-primary rounded-full py-sm items-center"
                onPress={onContinue}
              >
                <Text className="text-on-primary text-label-lg font-semibold">
                  {t("Continue anyway")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
