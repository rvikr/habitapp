import { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Habit } from "@/types/db";
import { parseOptionalPositiveNumber } from "@/lib/auth/validation";
import { useLanguage } from "@/components/language-provider";

type Props = {
  visible: boolean;
  habit: Habit | null;
  initialValue?: number | null;
  onSubmit: (value: number, note: string) => Promise<{ ok: boolean; error?: string }> | void;
  onDismiss: () => void;
};

function formatInitialValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export default function LogPrompt({ visible, habit, initialValue, onSubmit, onDismiss }: Props) {
  const { t } = useLanguage();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setValue(formatInitialValue(initialValue));
    setError(null);
  }, [habit?.id, initialValue, visible]);

  async function handleSubmit() {
    const parsed = parseOptionalPositiveNumber(value);
    if (!parsed.ok) {
      setError(t("Enter a positive value."));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await onSubmit(parsed.value ?? 1, note);
      if (result && !result.ok) {
        setError(result.error ?? t("Could not save. Try again."));
        return;
      }
      setValue("");
      setNote("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end"
      >
        <TouchableOpacity className="flex-1" onPress={onDismiss} />
        <View className="bg-surface-lowest dark:bg-d-surface-lowest rounded-t-3xl p-lg">
          <View className="flex-row items-center justify-between mb-md">
            <Text className="text-headline-md text-on-surface dark:text-d-on-surface font-bold">
              {habit?.unit
                ? t("Log {unit}", { unit: habit.unit })
                : t("Log progress")}
            </Text>
            <TouchableOpacity onPress={onDismiss}>
              <MaterialCommunityIcons name="close" size={24} color="#8F8A82" />
            </TouchableOpacity>
          </View>
          {habit?.unit && (
            <View className="flex-row items-center gap-sm mb-sm">
              <TextInput
                className="flex-1 bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
                placeholder={t("Amount in {unit}", { unit: habit.unit })}
                placeholderTextColor="#8F8A82"
                value={value}
                onChangeText={setValue}
                keyboardType="decimal-pad"
              />
              <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
                {habit.unit}
              </Text>
            </View>
          )}
          <TextInput
            className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md mb-md"
            placeholder={t("Note (optional)")}
            placeholderTextColor="#8F8A82"
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={2}
          />
          {error && <Text className="text-error text-label-sm mb-sm">{error}</Text>}
          <TouchableOpacity
            className="bg-primary rounded-full py-sm items-center"
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text className="text-on-primary text-label-lg font-semibold">
              {submitting ? t("Saving...") : t("Log")}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
