import { useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch } from "react-native";
import Icon from "./icon";
import HabitCatalogPicker from "./habit-catalog-picker";
import type { Habit } from "@/types/db";
import type { CatalogEntry } from "@/lib/data/habit-catalog";
import { isValidReminderTime, parseOptionalPositiveNumber } from "@/lib/auth/validation";
import {
  inferHabitIntelligence,
  unitOptionsForHabit,
  type HabitType,
  type MetricType,
  type ReminderStrategy,
  type VisualType,
} from "@/lib/coach/habit-intelligence";
import { useLanguage } from "@/components/language-provider";
import HabitValidationModal from "@/components/habit-validation-modal";
import type { HabitValidationResult } from "@/lib/habits/validate";
import {
  clampDefaultLogValueToTarget,
  shouldExpandHabitFormAdvanced,
  type HabitFormVariant,
} from "@/lib/habits/form-variant";

function smartReminderSummary(
  intervalMinutes: number | null,
  strategy: ReminderStrategy,
  t: (message: string, values?: Record<string, string | number>) => string,
): string {
  const interval = intervalMinutes ?? 720;
  const slotsPerDay = Math.round((14 * 60) / interval);
  const count = Math.max(1, slotsPerDay);
  const suffix = strategy === "conditional_interval" ? t(", stops once done for the day") : "";
  if (count === 1) return t("One smart reminder per day{suffix}.", { suffix });
  return t("Up to {count} smart reminders per day{suffix}.", { count, suffix });
}

const ICONS = [
  "water_drop",
  "directions_run",
  "directions_walk",
  "menu_book",
  "self_improvement",
  "edit_note",
  "fitness_center",
  "bedtime",
  "medication",
  "restaurant",
  "shower",
  "code",
  "directions_bike",
  "wallet",
  "favorite",
  "eco",
  "spa",
];
const COLORS: {
  id: "primary" | "secondary" | "tertiary" | "neutral";
  label: string;
  hex: string;
}[] = [
  { id: "primary", label: "Ember", hex: "#F26B1F" },
  { id: "secondary", label: "Sage", hex: "#3EBB7F" },
  { id: "tertiary", label: "Amber", hex: "#E4A23A" },
  { id: "neutral", label: "Neutral", hex: "#5A554D" },
];
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const TIME_PRESETS = ["07:00", "08:00", "12:00", "16:00", "20:00", "22:00"];
const METRIC_LABELS: Record<MetricType, string> = {
  volume_ml: "Volume",
  steps: "Steps",
  hours: "Hours",
  pages: "Pages",
  minutes: "Minutes",
  distance_km: "Distance",
  boolean: "Done / not done",
};

type ColorId = "primary" | "secondary" | "tertiary" | "neutral";
type FormData = {
  name: string;
  description: string | null;
  icon: string;
  color: ColorId;
  unit: string;
  target: number | null;
  remindersEnabled: boolean;
  reminderTimes: string[];
  reminderDays: number[];
  habitType: HabitType;
  metricType: MetricType;
  visualType: VisualType;
  reminderStrategy: ReminderStrategy;
  reminderIntervalMinutes: number | null;
  defaultLogValue: number | null;
  mergeSimilar: boolean;
  acknowledgeWarning?: boolean;
};

export type HabitFormSubmitResult = {
  ok: boolean;
  validation?: HabitValidationResult;
};

type Props = {
  initial?: Habit;
  onSubmit: (data: FormData) => Promise<HabitFormSubmitResult>;
  submitLabel?: string;
  variant?: HabitFormVariant;
};

export default function HabitForm({
  initial,
  onSubmit,
  submitLabel = "Save",
  variant = "standard",
}: Props) {
  const { t } = useLanguage();
  const isTreatment = variant === "treatment" && !initial;
  const [showCatalog, setShowCatalog] = useState(!initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "spa");
  const [color, setColor] = useState<ColorId>(initial?.color ?? "primary");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [target, setTarget] = useState(initial?.target?.toString() ?? "");
  const [remindersEnabled, setRemindersEnabled] = useState(initial?.reminders_enabled ?? false);
  const [reminderTimes, setReminderTimes] = useState<string[]>(initial?.reminder_times ?? []);
  const [reminderDays, setReminderDays] = useState<number[]>(
    initial?.reminder_days ?? [0, 1, 2, 3, 4, 5, 6],
  );
  const [habitType, setHabitType] = useState<HabitType>(initial?.habit_type ?? "custom");
  const [metricType, setMetricType] = useState<MetricType>(initial?.metric_type ?? "boolean");
  const [visualType, setVisualType] = useState<VisualType>(initial?.visual_type ?? "progress_ring");
  const [reminderStrategy, setReminderStrategy] = useState<ReminderStrategy>(
    initial?.reminder_strategy ?? "manual",
  );
  const [reminderIntervalMinutes, setReminderIntervalMinutes] = useState<number | null>(
    initial?.reminder_interval_minutes ?? null,
  );
  const [defaultLogValue, setDefaultLogValue] = useState<number | null>(
    initial?.default_log_value ?? null,
  );
  const [mergeSimilar, setMergeSimilar] = useState(true);
  const [showMetricOptions, setShowMetricOptions] = useState(false);
  const [customTime, setCustomTime] = useState("");
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [validation, setValidation] = useState<HabitValidationResult | null>(null);
  const [lastPayload, setLastPayload] = useState<FormData | null>(null);

  function applyTemplate(entry: CatalogEntry) {
    setName(entry.name);
    setDescription(entry.description);
    setIcon(entry.icon);
    setColor(entry.color as ColorId);
    setUnit(entry.unit);
    setTarget(entry.target?.toString() ?? "");
    setHabitType(entry.habitType);
    setMetricType(entry.metricType);
    setVisualType(entry.visualType);
    setReminderStrategy(entry.reminderStrategy);
    setReminderIntervalMinutes(entry.reminderIntervalMinutes);
    setDefaultLogValue(entry.defaultLogValue);
    setRemindersEnabled(entry.remindersEnabledByDefault ?? entry.defaultTimes.length > 0);
    setReminderTimes(entry.defaultTimes);
    setReminderDays(entry.defaultReminderDays ?? [0, 1, 2, 3, 4, 5, 6]);
    setShowCatalog(false);
  }

  function toggleTime(time: string) {
    setReminderTimes((prev) =>
      prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time].sort(),
    );
  }

  function addCustomTime() {
    const nextTime = customTime.trim();
    if (!isValidReminderTime(nextTime)) {
      if (isTreatment && shouldExpandHabitFormAdvanced("treatment", "reminders")) {
        setAdvancedExpanded(true);
      }
      setFormError(t("Use a valid 24-hour time, for example 08:30."));
      return;
    }
    if (!reminderTimes.includes(nextTime)) {
      setReminderTimes((prev) => [...prev, nextTime].sort());
    }
    setCustomTime("");
    setFormError(null);
  }

  function toggleDay(day: number) {
    setReminderDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  async function handleSubmit() {
    if (submittingRef.current) return;
    if (loading) return;
    if (!name.trim()) return;
    const parsedTarget = parseOptionalPositiveNumber(target);
    if (!parsedTarget.ok) {
      if (isTreatment && shouldExpandHabitFormAdvanced("treatment", "target")) {
        setAdvancedExpanded(true);
      }
      setFormError(t(parsedTarget.error));
      return;
    }
    const intelligence = inferHabitIntelligence({
      name,
      icon,
      unit,
      target: parsedTarget.value,
      habitType,
      metricType,
      visualType,
      reminderStrategy,
      reminderIntervalMinutes,
      defaultLogValue,
    });
    if (
      remindersEnabled &&
      intelligence.reminderStrategy === "manual" &&
      reminderTimes.length === 0
    ) {
      if (isTreatment && shouldExpandHabitFormAdvanced("treatment", "reminders")) {
        setAdvancedExpanded(true);
      }
      setFormError(t("Add at least one reminder time or turn reminders off."));
      return;
    }
    if (remindersEnabled && reminderTimes.some((time) => !isValidReminderTime(time))) {
      if (isTreatment && shouldExpandHabitFormAdvanced("treatment", "reminders")) {
        setAdvancedExpanded(true);
      }
      setFormError(t("Use valid 24-hour reminder times."));
      return;
    }
    if (reminderDays.some((day) => day < 0 || day > 6)) {
      if (isTreatment && shouldExpandHabitFormAdvanced("treatment", "reminders")) {
        setAdvancedExpanded(true);
      }
      setFormError(t("Choose valid reminder days."));
      return;
    }
    setFormError(null);
    const payload: FormData = {
      name: name.trim(),
      description: description.trim() || null,
      icon,
      color,
      unit: unit.trim(),
      target: parsedTarget.value,
      remindersEnabled,
      reminderTimes: remindersEnabled ? reminderTimes : [],
      reminderDays: remindersEnabled
        ? reminderDays.length > 0
          ? reminderDays
          : [0, 1, 2, 3, 4, 5, 6]
        : [0, 1, 2, 3, 4, 5, 6],
      habitType: intelligence.habitType,
      metricType: intelligence.metricType,
      visualType: intelligence.visualType,
      reminderStrategy: intelligence.reminderStrategy,
      reminderIntervalMinutes: intelligence.reminderIntervalMinutes,
      defaultLogValue: isTreatment
        ? clampDefaultLogValueToTarget(intelligence.defaultLogValue, intelligence.target)
        : intelligence.defaultLogValue,
      mergeSimilar,
    };
    await submitWithPayload(payload);
  }

  async function submitWithPayload(payload: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLastPayload(payload);
    setLoading(true);
    try {
      const result = await onSubmit(payload);
      if (!result.ok && result.validation && result.validation.status !== "ok") {
        if (isTreatment && shouldExpandHabitFormAdvanced("treatment", "validation")) {
          setAdvancedExpanded(true);
        }
        setValidation(result.validation);
      } else {
        setValidation(null);
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  function continueAnyway() {
    if (!lastPayload) return;
    setValidation(null);
    void submitWithPayload({ ...lastPayload, acknowledgeWarning: true });
  }

  function applySuggestion(suggestion: NonNullable<HabitValidationResult["suggestion"]>) {
    if (suggestion.name) setName(suggestion.name);
    if (suggestion.unit || suggestion.target != null) {
      if (isTreatment && shouldExpandHabitFormAdvanced("treatment", "validation")) {
        setAdvancedExpanded(true);
      }
      if (suggestion.unit) setUnit(suggestion.unit);
      if (suggestion.target != null) setTarget(String(suggestion.target));
    }
    setValidation(null);
  }

  if (showCatalog && !initial) {
    return <HabitCatalogPicker onSelect={applyTemplate} onSkip={() => setShowCatalog(false)} />;
  }

  const previewTarget = parseOptionalPositiveNumber(target);
  const metricPreview = inferHabitIntelligence({
    name,
    icon,
    unit,
    target: previewTarget.ok ? previewTarget.value : null,
    habitType,
    metricType,
    visualType,
    reminderStrategy,
    reminderIntervalMinutes,
    defaultLogValue,
  });
  const metricOptions = unitOptionsForHabit(metricPreview.habitType, metricPreview.metricType);
  const storagePreview =
    metricPreview.metricType === "volume_ml" &&
    unit.trim().toLowerCase() === "l" &&
    previewTarget.ok &&
    previewTarget.value != null
      ? t("{litres} l will be saved as {millilitres} ml.", {
          litres: previewTarget.value,
          millilitres: metricPreview.target ?? previewTarget.value * 1000,
        })
      : metricPreview.metricType === "volume_ml"
        ? t("Water volume is saved in ml.")
        : null;
  const treatmentTargetSummary = target.trim()
    ? t("Target: {target} {unit}", {
        target: target.trim(),
        unit: unit.trim() || t("none"),
      })
    : t("No target");
  const treatmentReminderSummary = remindersEnabled
    ? reminderTimes.length > 0
      ? t("Reminders: {count}", { count: reminderTimes.length })
      : t("Reminders: on")
    : t("Reminders: off");

  function selectMetricOption(option: (typeof metricOptions)[number]) {
    setUnit(option.unit);
    setMetricType(option.metricType);
    if (option.metricType === "volume_ml") {
      setHabitType("water_intake");
      setVisualType("water_bottle");
      setReminderStrategy("interval");
      setReminderIntervalMinutes(120);
      setDefaultLogValue(250);
    } else if (option.metricType === "distance_km") {
      setVisualType("progress_ring");
      setDefaultLogValue(option.unit === "m" ? 0.5 : 1);
    } else if (option.metricType === "steps") {
      setHabitType("walk");
      setVisualType("step_path");
      setReminderStrategy("conditional_interval");
      setReminderIntervalMinutes(60);
      setDefaultLogValue(1000);
    } else if (option.metricType === "hours") {
      setDefaultLogValue(1);
    } else if (option.metricType === "minutes") {
      setDefaultLogValue(10);
    } else if (option.metricType === "pages") {
      setDefaultLogValue(10);
    }
    setShowMetricOptions(false);
  }

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-margin-mobile gap-md">
          {/* Name */}
          <View>
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">
              {t("NAME")}
            </Text>
            <TextInput
              className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
              placeholder={t("Habit name")}
              placeholderTextColor="#8F8A82"
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
          </View>

          {/* Description */}
          <View>
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">
              {t("DESCRIPTION (optional)")}
            </Text>
            <TextInput
              className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
              placeholder={t("What's this habit about?")}
              placeholderTextColor="#8F8A82"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={2}
              maxLength={500}
            />
          </View>

          {isTreatment && (
            <>
              <View
                className="bg-surface-container dark:bg-d-surface-container rounded-xl px-md py-sm gap-xs"
                accessible
                accessibilityRole="summary"
                accessibilityLabel={`${treatmentTargetSummary}. ${treatmentReminderSummary}`}
              >
                <Text className="text-body-sm text-on-surface dark:text-d-on-surface font-semibold">
                  {treatmentTargetSummary}
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  {treatmentReminderSummary}
                </Text>
              </View>
              <TouchableOpacity
                className="bg-surface-container dark:bg-d-surface-container rounded-xl px-md py-sm flex-row items-center justify-between"
                onPress={() => setAdvancedExpanded((value) => !value)}
                accessibilityRole="button"
                accessibilityLabel={t(
                  advancedExpanded ? "Hide advanced habit options" : "Show advanced habit options",
                )}
                accessibilityState={{ expanded: advancedExpanded }}
                aria-expanded={advancedExpanded}
              >
                <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                  {t("Advanced")}
                </Text>
                <Text className="text-primary text-body-md">{advancedExpanded ? "^" : "v"}</Text>
              </TouchableOpacity>
            </>
          )}

          {(!isTreatment || advancedExpanded) && (
            <>
              {/* Icon picker */}
              <View>
                <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">
                  {t("ICON")}
                </Text>
                <View className="flex-row flex-wrap gap-sm">
                  {ICONS.map((ic) => (
                    <TouchableOpacity
                      key={ic}
                      className="w-12 h-12 rounded-xl items-center justify-center"
                      style={{ backgroundColor: icon === ic ? "#F26B1F" : "#F2EDE4" }}
                      onPress={() => setIcon(ic)}
                      accessibilityRole="button"
                      accessibilityLabel={t("Select {label}", { label: ic.replace(/_/g, " ") })}
                      accessibilityState={{ selected: icon === ic }}
                    >
                      <Icon name={ic} size={24} color={icon === ic ? "#fff" : "#484554"} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Color picker */}
              <View>
                <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">
                  {t("COLOR")}
                </Text>
                <View className="flex-row gap-sm">
                  {COLORS.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      className="flex-1 py-sm rounded-xl items-center"
                      style={{
                        backgroundColor: c.hex + "22",
                        borderWidth: 2,
                        borderColor: color === c.id ? c.hex : "transparent",
                      }}
                      onPress={() => setColor(c.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t("Select color {label}", { label: t(c.label) })}
                      accessibilityState={{ selected: color === c.id }}
                    >
                      <View
                        className="w-5 h-5 rounded-full mb-xs"
                        style={{ backgroundColor: c.hex }}
                      />
                      <Text className="text-label-sm" style={{ color: c.hex }}>
                        {t(c.label)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Unit + Target */}
              <View className="flex-row gap-sm">
                <View className="flex-1">
                  <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">
                    {t("UNIT")}
                  </Text>
                  <TextInput
                    className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
                    placeholder={t("ml, km, min...")}
                    placeholderTextColor="#8F8A82"
                    value={unit}
                    onChangeText={setUnit}
                    maxLength={16}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">
                    {t("TARGET")}
                  </Text>
                  <TextInput
                    className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
                    placeholder={t("e.g. 2000")}
                    placeholderTextColor="#8F8A82"
                    value={target}
                    onChangeText={setTarget}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View className="bg-primary-fixed dark:bg-d-surface-container rounded-xl px-md py-sm">
                <Text className="text-label-lg text-primary mb-xs">{t("SMART METRIC")}</Text>
                <TouchableOpacity
                  className="bg-surface-lowest dark:bg-d-surface-lowest rounded-xl px-md py-sm flex-row items-center justify-between"
                  onPress={() => setShowMetricOptions((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={t("Smart metric: {label}", {
                    label: t(METRIC_LABELS[metricPreview.metricType]),
                  })}
                  accessibilityState={{ expanded: showMetricOptions }}
                >
                  <View>
                    <Text className="text-body-md text-on-background dark:text-d-on-background font-semibold">
                      {t(METRIC_LABELS[metricPreview.metricType])}
                    </Text>
                    <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                      {t("Unit: {unit}", { unit: unit || metricPreview.unit || t("none") })}
                    </Text>
                    {storagePreview && (
                      <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                        {storagePreview}
                      </Text>
                    )}
                  </View>
                  <Text className="text-primary text-body-md">{showMetricOptions ? "^" : "v"}</Text>
                </TouchableOpacity>
                {showMetricOptions && metricOptions.length > 0 && (
                  <View className="mt-xs bg-surface-lowest dark:bg-d-surface-lowest rounded-xl overflow-hidden">
                    {metricOptions.map((option) => {
                      const active = unit === option.unit && metricType === option.metricType;
                      return (
                        <TouchableOpacity
                          key={`${option.metricType}-${option.unit}`}
                          className="px-md py-sm border-b border-outline-variant dark:border-d-outline-variant"
                          style={{ backgroundColor: active ? "#FFE6CF" : "transparent" }}
                          onPress={() => selectMetricOption(option)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text className="text-body-sm text-on-background dark:text-d-on-background font-semibold">
                            {t(option.label)}
                          </Text>
                          <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                            {t("Store as {unit}", {
                              unit:
                                option.metricType === "volume_ml"
                                  ? "ml"
                                  : option.metricType === "distance_km"
                                    ? "km"
                                    : option.unit,
                            })}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Reminders */}
              <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-sm">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                      {t("Smart Reminders")}
                    </Text>
                    <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                      {reminderStrategy !== "manual"
                        ? t(
                            "Fires automatically based on your habit — stops once you log it for the day.",
                          )
                        : t("Set specific times for this habit.")}
                    </Text>
                  </View>
                  <Switch
                    value={remindersEnabled}
                    onValueChange={setRemindersEnabled}
                    trackColor={{ false: "#E6E0D5", true: "#F26B1F" }}
                    thumbColor="#fff"
                  />
                </View>

                {remindersEnabled && reminderStrategy !== "manual" && (
                  <Text className="text-label-sm text-primary">
                    {smartReminderSummary(reminderIntervalMinutes, reminderStrategy, t)}
                  </Text>
                )}

                {remindersEnabled && (
                  <>
                    <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mt-sm">
                      {reminderStrategy !== "manual"
                        ? t("CUSTOM OVERRIDE TIMES (optional)")
                        : t("TIMES")}
                    </Text>
                    <View className="flex-row flex-wrap gap-xs">
                      {TIME_PRESETS.map((t) => {
                        const active = reminderTimes.includes(t);
                        return (
                          <TouchableOpacity
                            key={t}
                            onPress={() => toggleTime(t)}
                            className={`px-md py-xs rounded-full ${active ? "bg-primary" : "bg-surface-high dark:bg-d-surface-high"}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                          >
                            <Text
                              className={`text-label-lg ${active ? "text-on-primary" : "text-on-surface dark:text-d-on-surface"}`}
                            >
                              {t}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {reminderTimes.filter((t) => !TIME_PRESETS.includes(t)).length > 0 && (
                      <View className="flex-row flex-wrap gap-xs">
                        {reminderTimes
                          .filter((time) => !TIME_PRESETS.includes(time))
                          .map((time) => (
                            <TouchableOpacity
                              key={time}
                              onPress={() => toggleTime(time)}
                              className="px-md py-xs rounded-full bg-primary flex-row items-center gap-xs"
                              accessibilityRole="button"
                              accessibilityLabel={t("Remove {label}", { label: time })}
                            >
                              <Text className="text-on-primary text-label-lg">{time}</Text>
                              <Text className="text-on-primary text-label-sm">x</Text>
                            </TouchableOpacity>
                          ))}
                      </View>
                    )}

                    <View className="flex-row gap-xs items-center">
                      <TextInput
                        className="flex-1 bg-surface-high dark:bg-d-surface-high text-on-surface dark:text-d-on-surface rounded-xl px-md py-xs text-body-md"
                        placeholder={t("HH:MM (24h)")}
                        placeholderTextColor="#8F8A82"
                        value={customTime}
                        onChangeText={setCustomTime}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                      <TouchableOpacity
                        className="bg-primary px-md py-xs rounded-full"
                        onPress={addCustomTime}
                        disabled={!isValidReminderTime(customTime)}
                        style={{ opacity: isValidReminderTime(customTime) ? 1 : 0.4 }}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !isValidReminderTime(customTime) }}
                      >
                        <Text className="text-on-primary text-label-lg">{t("Add")}</Text>
                      </TouchableOpacity>
                    </View>

                    <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mt-sm">
                      {t("REPEAT ON")}
                    </Text>
                    <View className="flex-row gap-xs">
                      {DAY_LABELS.map((label, i) => {
                        const active = reminderDays.includes(i);
                        return (
                          <TouchableOpacity
                            key={i}
                            onPress={() => toggleDay(i)}
                            className={`flex-1 py-xs rounded-full items-center ${active ? "bg-primary" : "bg-surface-high dark:bg-d-surface-high"}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                          >
                            <Text
                              className={`text-label-lg ${active ? "text-on-primary" : "text-on-surface dark:text-d-on-surface"}`}
                            >
                              {t(label)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>

              {!initial && (
                <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-center justify-between gap-md">
                  <View className="flex-1">
                    <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                      {t("Merge similar habits")}
                    </Text>
                    <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                      {t("Combine this with an existing habit when it looks like the same goal.")}
                    </Text>
                  </View>
                  <Switch
                    value={mergeSimilar}
                    onValueChange={setMergeSimilar}
                    trackColor={{ false: "#E6E0D5", true: "#F26B1F" }}
                    thumbColor="#fff"
                  />
                </View>
              )}
            </>
          )}

          {formError && (
            <View
              className="flex-row items-center justify-center gap-xs"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              accessibilityLabel={t("Error: {message}", { message: formError })}
            >
              <Icon name="alert-circle-outline" size={16} color="#BA1A1A" />
              <Text className="text-error text-label-sm text-center">
                {t("Error: {message}", { message: formError })}
              </Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            className="bg-primary rounded-full py-sm items-center mt-sm"
            onPress={handleSubmit}
            disabled={!name.trim() || loading}
            style={{ opacity: !name.trim() || loading ? 0.5 : 1 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !name.trim() || loading }}
          >
            <Text className="text-on-primary text-label-lg font-semibold">
              {loading ? t("Saving...") : t(submitLabel)}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <HabitValidationModal
        validation={validation}
        onEdit={() => setValidation(null)}
        onContinue={continueAnyway}
        onApplySuggestion={applySuggestion}
      />
    </>
  );
}
