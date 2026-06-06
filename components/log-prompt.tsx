import { useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Habit } from "@/types/db";
import { parseOptionalPositiveNumber } from "@/lib/auth/validation";
import { useLanguage } from "@/components/language-provider";
import { formatAmount } from "@/lib/coach/habit-intelligence";

type Props = {
  visible: boolean;
  habit: Habit | null;
  /** Today's already-logged amount, used for the progress line and quick-add math. */
  currentValue?: number;
  onSubmit: (value: number, note: string) => Promise<{ ok: boolean; error?: string }> | void;
  /** When provided, shows a "Mark all done" button that logs the full target after confirming. */
  onMarkAllDone?: () => Promise<{ ok: boolean; error?: string }> | void;
  onDismiss: () => void;
};

type QuickChip = { label: string; value: number };

function quickAddChips(habit: Habit, currentValue: number, fillLabel: string): QuickChip[] {
  const target = habit.target != null ? Number(habit.target) : null;
  const baseRaw =
    habit.default_log_value != null && Number(habit.default_log_value) > 0
      ? Number(habit.default_log_value)
      : target
        ? target / 4
        : 0;
  const base = Math.round(baseRaw * 10) / 10;
  const unitLabel = habit.unit ? ` ${habit.unit}` : "";
  const chips: QuickChip[] = [];
  const seen = new Set<number>();
  const push = (label: string, value: number) => {
    const rounded = Math.round(value * 10) / 10;
    if (rounded > 0 && !seen.has(rounded)) {
      seen.add(rounded);
      chips.push({ label, value: rounded });
    }
  };
  if (base > 0) {
    push(`+${formatAmount(base)}${unitLabel}`, base);
    push(`+${formatAmount(base * 2)}${unitLabel}`, base * 2);
  }
  if (target != null) {
    push(fillLabel, target - currentValue);
  }
  return chips.slice(0, 3);
}

export default function LogPrompt({
  visible,
  habit,
  currentValue = 0,
  onSubmit,
  onMarkAllDone,
  onDismiss,
}: Props) {
  const { t } = useLanguage();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitValue(amount: number) {
    setError(null);
    setSubmitting(true);
    try {
      const result = await onSubmit(amount, note);
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

  async function handleSubmit() {
    const parsed = parseOptionalPositiveNumber(value);
    if (!parsed.ok) {
      setError(t("Enter a positive value."));
      return;
    }
    await submitValue(parsed.value ?? 1);
  }

  function handleMarkAllDone() {
    if (!habit || !onMarkAllDone) return;
    const target = habit.target != null ? formatAmount(Number(habit.target)) : "";
    const unit = habit.unit ? ` ${habit.unit}` : "";
    Alert.alert(
      t("Mark complete?"),
      t("Did you really finish all {target}{unit} of {name}?", {
        target,
        unit,
        name: habit.name,
      }),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Yes, all done"),
          onPress: async () => {
            setError(null);
            setSubmitting(true);
            try {
              const result = await onMarkAllDone();
              if (result && !result.ok) {
                setError(result.error ?? t("Could not save. Try again."));
              }
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }

  const target = habit?.target != null ? Number(habit.target) : null;
  const chips = habit ? quickAddChips(habit, currentValue, t("Fill to goal")) : [];

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
              {habit?.unit ? t("Log {unit}", { unit: habit.unit }) : t("Log progress")}
            </Text>
            <TouchableOpacity onPress={onDismiss}>
              <MaterialCommunityIcons name="close" size={24} color="#8F8A82" />
            </TouchableOpacity>
          </View>

          {target != null && (
            <Text className="text-body-sm text-on-surface-variant dark:text-d-on-surface-variant mb-md">
              {`${formatAmount(currentValue)} / ${formatAmount(target)}${
                habit?.unit ? ` ${habit.unit}` : ""
              }`}
            </Text>
          )}

          {chips.length > 0 && (
            <View className="flex-row flex-wrap gap-sm mb-md">
              {chips.map((chip) => (
                <TouchableOpacity
                  key={chip.label}
                  className="bg-surface-container dark:bg-d-surface-container rounded-full px-md py-sm"
                  onPress={() => submitValue(chip.value)}
                  disabled={submitting}
                >
                  <Text className="text-label-lg text-on-surface dark:text-d-on-surface font-semibold">
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

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

          {onMarkAllDone && (
            <TouchableOpacity
              className="py-sm items-center mt-xs"
              onPress={handleMarkAllDone}
              disabled={submitting}
            >
              <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant font-semibold">
                {target != null
                  ? t("Mark all done ({target}{unit})", {
                      target: formatAmount(target),
                      unit: habit?.unit ? ` ${habit.unit}` : "",
                    })
                  : t("Mark all done")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
