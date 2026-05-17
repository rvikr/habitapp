import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Switch } from "react-native";
import Icon from "./icon";
import HabitCatalogPicker from "./habit-catalog-picker";
import type { Habit } from "@/types/db";
import type { CatalogEntry } from "@/lib/habit-catalog";
import { isValidReminderTime, parseOptionalPositiveNumber } from "@/lib/validation";
import {
  inferHabitIntelligence,
  unitOptionsForHabit,
  type HabitType,
  type MetricType,
  type ReminderStrategy,
  type VisualType,
} from "@/lib/habit-intelligence";

function smartReminderSummary(intervalMinutes: number | null, strategy: ReminderStrategy): string {
  const interval = intervalMinutes ?? 720;
  const slotsPerDay = Math.round((14 * 60) / interval);
  const count = Math.max(1, slotsPerDay);
  const suffix = strategy === "conditional_interval" ? ", stops once done for the day" : "";
  if (count === 1) return `One smart reminder per day${suffix}.`;
  return `Up to ${count} smart reminders per day${suffix}.`;
}

const ICONS = ["water_drop", "directions_run", "directions_walk", "menu_book", "self_improvement", "edit_note", "fitness_center", "bedtime", "medication", "restaurant", "shower", "code", "directions_bike", "favorite", "eco", "spa"];
const COLORS: Array<{ id: "primary" | "secondary" | "tertiary" | "neutral"; label: string; hex: string }> = [
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
};

type Props = {
  initial?: Habit;
  onSubmit: (data: FormData) => Promise<void>;
  submitLabel?: string;
};

export default function HabitForm({ initial, onSubmit, submitLabel = "Save" }: Props) {
  const [showCatalog, setShowCatalog] = useState(!initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "spa");
  const [color, setColor] = useState<ColorId>(initial?.color ?? "primary");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [target, setTarget] = useState(initial?.target?.toString() ?? "");
  const [remindersEnabled, setRemindersEnabled] = useState(initial?.reminders_enabled ?? false);
  const [reminderTimes, setReminderTimes] = useState<string[]>(initial?.reminder_times ?? []);
  const [reminderDays, setReminderDays] = useState<number[]>(initial?.reminder_days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [habitType, setHabitType] = useState<HabitType>(initial?.habit_type ?? "custom");
  const [metricType, setMetricType] = useState<MetricType>(initial?.metric_type ?? "boolean");
  const [visualType, setVisualType] = useState<VisualType>(initial?.visual_type ?? "progress_ring");
  const [reminderStrategy, setReminderStrategy] = useState<ReminderStrategy>(initial?.reminder_strategy ?? "manual");
  const [reminderIntervalMinutes, setReminderIntervalMinutes] = useState<number | null>(initial?.reminder_interval_minutes ?? null);
  const [defaultLogValue, setDefaultLogValue] = useState<number | null>(initial?.default_log_value ?? null);
  const [mergeSimilar, setMergeSimilar] = useState(true);
  const [showMetricOptions, setShowMetricOptions] = useState(false);
  const [customTime, setCustomTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    setReminderTimes((prev) => prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time].sort());
  }

  function addCustomTime() {
    const t = customTime.trim();
    if (!isValidReminderTime(t)) {
      setFormError("Use a valid 24-hour time, for example 08:30.");
      return;
    }
    if (!reminderTimes.includes(t)) setReminderTimes((prev) => [...prev, t].sort());
    setCustomTime("");
    setFormError(null);
  }

  function toggleDay(day: number) {
    setReminderDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());
  }

  async function handleSubmit() {
    if (!name.trim()) return;
    const parsedTarget = parseOptionalPositiveNumber(target);
    if (!parsedTarget.ok) {
      setFormError(parsedTarget.error);
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
    if (remindersEnabled && intelligence.reminderStrategy === "manual" && reminderTimes.length === 0) {
      setFormError("Add at least one reminder time or turn reminders off.");
      return;
    }
    if (remindersEnabled && reminderTimes.some((time) => !isValidReminderTime(time))) {
      setFormError("Use valid 24-hour reminder times.");
      return;
    }
    if (reminderDays.some((day) => day < 0 || day > 6)) {
      setFormError("Choose valid reminder days.");
      return;
    }
    setFormError(null);
    setLoading(true);
    await onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      icon,
      color,
      unit: unit.trim(),
      target: parsedTarget.value,
      remindersEnabled,
      reminderTimes: remindersEnabled ? reminderTimes : [],
      reminderDays: remindersEnabled ? (reminderDays.length > 0 ? reminderDays : [0, 1, 2, 3, 4, 5, 6]) : [0, 1, 2, 3, 4, 5, 6],
      habitType: intelligence.habitType,
      metricType: intelligence.metricType,
      visualType: intelligence.visualType,
      reminderStrategy: intelligence.reminderStrategy,
      reminderIntervalMinutes: intelligence.reminderIntervalMinutes,
      defaultLogValue: intelligence.defaultLogValue,
      mergeSimilar,
    });
    setLoading(false);
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
    metricPreview.metricType === "volume_ml" && unit.trim().toLowerCase() === "l" && previewTarget.ok && previewTarget.value != null
      ? `${previewTarget.value} l will be saved as ${metricPreview.target ?? previewTarget.value * 1000} ml.`
      : metricPreview.metricType === "volume_ml"
        ? "Water volume is saved in ml."
        : null;

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
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <View className="px-margin-mobile gap-md">
        {/* Name */}
        <View>
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">NAME</Text>
          <TextInput
            className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
            placeholder="Habit name"
            placeholderTextColor="#8F8A82"
            value={name}
            onChangeText={setName}
          />
        </View>

        {/* Description */}
        <View>
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">DESCRIPTION (optional)</Text>
          <TextInput
            className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
            placeholder="What's this habit about?"
            placeholderTextColor="#8F8A82"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* Icon picker */}
        <View>
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">ICON</Text>
          <View className="flex-row flex-wrap gap-sm">
            {ICONS.map((ic) => (
              <TouchableOpacity
                key={ic}
                className="w-12 h-12 rounded-xl items-center justify-center"
                style={{ backgroundColor: icon === ic ? "#F26B1F" : "#F2EDE4" }}
                onPress={() => setIcon(ic)}
              >
                <Icon name={ic} size={24} color={icon === ic ? "#fff" : "#484554"} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Color picker */}
        <View>
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">COLOR</Text>
          <View className="flex-row gap-sm">
            {COLORS.map((c) => (
              <TouchableOpacity
                key={c.id}
                className="flex-1 py-sm rounded-xl items-center"
                style={{ backgroundColor: c.hex + "22", borderWidth: 2, borderColor: color === c.id ? c.hex : "transparent" }}
                onPress={() => setColor(c.id)}
              >
                <View className="w-5 h-5 rounded-full mb-xs" style={{ backgroundColor: c.hex }} />
                <Text className="text-label-sm" style={{ color: c.hex }}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Unit + Target */}
        <View className="flex-row gap-sm">
          <View className="flex-1">
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">UNIT</Text>
            <TextInput
              className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
              placeholder="ml, km, min..."
              placeholderTextColor="#8F8A82"
              value={unit}
              onChangeText={setUnit}
            />
          </View>
          <View className="flex-1">
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">TARGET</Text>
            <TextInput
              className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
              placeholder="e.g. 2000"
              placeholderTextColor="#8F8A82"
              value={target}
              onChangeText={setTarget}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View className="bg-primary-fixed dark:bg-d-surface-container rounded-xl px-md py-sm">
          <Text className="text-label-lg text-primary mb-xs">SMART METRIC</Text>
          <TouchableOpacity
            className="bg-surface-lowest dark:bg-d-surface-lowest rounded-xl px-md py-sm flex-row items-center justify-between"
            onPress={() => setShowMetricOptions((prev) => !prev)}
          >
            <View>
              <Text className="text-body-md text-on-background dark:text-d-on-background font-semibold">
                {METRIC_LABELS[metricPreview.metricType]}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                Unit: {unit || metricPreview.unit || "none"}
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
                  >
                    <Text className="text-body-sm text-on-background dark:text-d-on-background font-semibold">{option.label}</Text>
                    <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                      Store as {option.metricType === "volume_ml" ? "ml" : option.metricType === "distance_km" ? "km" : option.unit}
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
              <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">Smart Reminders</Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {reminderStrategy !== "manual"
                  ? "Fires automatically based on your habit — stops once you log it for the day."
                  : "Set specific times for this habit."}
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
              {smartReminderSummary(reminderIntervalMinutes, reminderStrategy)}
            </Text>
          )}

          {remindersEnabled && (
            <>
              <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mt-sm">
                {reminderStrategy !== "manual" ? "CUSTOM OVERRIDE TIMES (optional)" : "TIMES"}
              </Text>
              <View className="flex-row flex-wrap gap-xs">
                {TIME_PRESETS.map((t) => {
                  const active = reminderTimes.includes(t);
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => toggleTime(t)}
                      className={`px-md py-xs rounded-full ${active ? "bg-primary" : "bg-surface-high dark:bg-d-surface-high"}`}
                    >
                      <Text className={`text-label-lg ${active ? "text-on-primary" : "text-on-surface dark:text-d-on-surface"}`}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {reminderTimes.filter((t) => !TIME_PRESETS.includes(t)).length > 0 && (
                <View className="flex-row flex-wrap gap-xs">
                  {reminderTimes.filter((t) => !TIME_PRESETS.includes(t)).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => toggleTime(t)}
                      className="px-md py-xs rounded-full bg-primary flex-row items-center gap-xs"
                    >
                      <Text className="text-on-primary text-label-lg">{t}</Text>
                      <Text className="text-on-primary text-label-sm">x</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View className="flex-row gap-xs items-center">
                <TextInput
                  className="flex-1 bg-surface-high dark:bg-d-surface-high text-on-surface dark:text-d-on-surface rounded-xl px-md py-xs text-body-md"
                  placeholder="HH:MM (24h)"
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
                >
                  <Text className="text-on-primary text-label-lg">Add</Text>
                </TouchableOpacity>
              </View>

              <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mt-sm">REPEAT ON</Text>
              <View className="flex-row gap-xs">
                {DAY_LABELS.map((label, i) => {
                  const active = reminderDays.includes(i);
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => toggleDay(i)}
                      className={`flex-1 py-xs rounded-full items-center ${active ? "bg-primary" : "bg-surface-high dark:bg-d-surface-high"}`}
                    >
                      <Text className={`text-label-lg ${active ? "text-on-primary" : "text-on-surface dark:text-d-on-surface"}`}>{label}</Text>
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
              <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">Merge similar habits</Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                Combine this with an existing habit when it looks like the same goal.
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

        {formError && <Text className="text-error text-label-sm text-center">{formError}</Text>}

        {/* Submit */}
        <TouchableOpacity
          className="bg-primary rounded-full py-sm items-center mt-sm"
          onPress={handleSubmit}
          disabled={loading || !name.trim()}
          style={{ opacity: !name.trim() ? 0.5 : 1 }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-on-primary text-label-lg font-semibold">{submitLabel}</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
