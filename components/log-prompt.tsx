import { useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { showAlert } from "@/lib/platform/alert";
import {
  operationForCompletionSubmission,
  type CompletionSubmissionOperation,
} from "@/lib/data/completion-submission-operation";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Habit } from "@/types/db";
import { parseOptionalPositiveNumber } from "@/lib/auth/validation";
import { useLanguage } from "@/components/language-provider";
import {
  formatAmount,
  progressForHabit,
  suggestedCheckInForHabit,
} from "@/lib/coach/habit-intelligence";

type Props = {
  visible: boolean;
  habit: Habit | null;
  /** Today's already-logged amount, used for the progress line and quick-add math. */
  currentValue?: number;
  onSubmit: (
    value: number,
    note: string,
    operationId: string,
  ) => Promise<{ ok: boolean; error?: string }> | void;
  /** When provided, shows a "Mark all done" button that logs the full target in one tap. */
  onMarkAllDone?: () => Promise<{ ok: boolean; error?: string }> | void;
  onDismiss: () => void;
};

type QuickChip = { label: string; value: number };

// A manually typed amount this many times the daily goal is almost certainly a
// slip (wrong unit, extra digit) — confirm before saving so values like "143"
// for a 5 km goal don't land silently.
const IMPLAUSIBLE_TARGET_MULTIPLE = 10;

function quickAddChips(habit: Habit, currentValue: number, fillLabel: string): QuickChip[] {
  const target = habit.target != null ? Number(habit.target) : null;
  const suggestion = suggestedCheckInForHabit(
    habit,
    progressForHabit(habit, currentValue > 0 ? { value: currentValue } : null),
  );
  // When a legacy habit has no canonical default, target/4 and target/2 are
  // user-selected fallback controls, not canonical suggestions.
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
  if (suggestion) {
    push(`+${suggestion.label}`, suggestion.value);
    push(
      `+${formatAmount(Math.min(base * 2, suggestion.remainingBefore))}${unitLabel}`,
      Math.min(base * 2, suggestion.remainingBefore),
    );
  } else if (base > 0) {
    const remaining = target != null && target > 0 ? Math.max(target - currentValue, 0) : null;
    const firstValue = remaining == null ? base : Math.min(base, remaining);
    const secondValue = remaining == null ? base * 2 : Math.min(base * 2, remaining);
    push(`+${formatAmount(firstValue)}${unitLabel}`, firstValue);
    push(`+${formatAmount(secondValue)}${unitLabel}`, secondValue);
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
  const submittingRef = useRef(false);
  const pendingOperationRef = useRef<CompletionSubmissionOperation | null>(null);

  async function submitValue(amount: number) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const operation = operationForCompletionSubmission(
      pendingOperationRef.current,
      { habitId: habit?.id ?? "", value: amount, note },
      Crypto.randomUUID,
    );
    pendingOperationRef.current = operation;
    const operationId = operation.id;
    setError(null);
    setSubmitting(true);
    try {
      const result = await onSubmit(amount, note, operationId);
      if (result && !result.ok) {
        setError(result.error ?? t("Could not save. Try again."));
        return;
      }
      pendingOperationRef.current = null;
      setValue("");
      setNote("");
    } catch {
      setError(t("Could not save. Try again."));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    const parsed = parseOptionalPositiveNumber(value);
    if (!parsed.ok) {
      setError(t("Enter a positive value."));
      return;
    }
    const amount = parsed.value ?? 1;
    const goal = habit?.target != null ? Number(habit.target) : null;
    if (goal != null && goal > 0 && amount > goal * IMPLAUSIBLE_TARGET_MULTIPLE) {
      const unit = habit?.unit ? ` ${habit.unit}` : "";
      showAlert(
        t("That's a lot — log anyway?"),
        t("{amount}{unit} is much higher than your {goal}{unit} goal. Log it anyway?", {
          amount: formatAmount(amount),
          goal: formatAmount(goal),
          unit,
        }),
        [
          { text: t("Cancel"), style: "cancel" },
          { text: t("Log anyway"), onPress: () => void submitValue(amount) },
        ],
      );
      return;
    }
    await submitValue(amount);
  }

  async function handleMarkAllDone() {
    if (!habit || !onMarkAllDone || submittingRef.current) return;
    submittingRef.current = true;
    // "Mark all done" is a preset action — log the full target in one tap without
    // re-confirming. Manually typed amounts still confirm via handleSubmit.
    setError(null);
    setSubmitting(true);
    try {
      const result = await onMarkAllDone();
      if (result && !result.ok) {
        setError(result.error ?? t("Could not save. Try again."));
        return;
      }
      pendingOperationRef.current = null;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const target = habit?.target != null ? Number(habit.target) : null;
  const chips = habit ? quickAddChips(habit, currentValue, t("Fill to goal")) : [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end"
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("Dismiss log prompt")}
          className="flex-1"
          onPress={onDismiss}
        />
        <View className="bg-surface-lowest dark:bg-d-surface-lowest rounded-t-3xl p-lg">
          <View className="flex-row items-center justify-between mb-md">
            <Text className="text-headline-md text-on-surface dark:text-d-on-surface font-bold">
              {habit?.unit ? t("Log {unit}", { unit: habit.unit }) : t("Log progress")}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("Close log prompt")}
              onPress={onDismiss}
            >
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
                  accessibilityRole="button"
                  accessibilityLabel={t("Log {value}", { value: chip.label })}
                  accessibilityState={{ disabled: submitting }}
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
            accessibilityRole="button"
            accessibilityLabel={t("Log progress")}
            accessibilityState={{ disabled: submitting }}
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
              accessibilityRole="button"
              accessibilityLabel={t("Mark all done")}
              accessibilityState={{ disabled: submitting }}
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
