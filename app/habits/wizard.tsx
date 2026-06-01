import { useState } from "react";
import {
  Alert,
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Icon from "@/components/icon";
import { ProUpgradeBanner } from "@/components/pro-access-banner";
import { createHabit } from "@/lib/data/actions";
import {
  buildRoutineRecommendations,
  type HabitRecommendation,
  type RoutineWizardAnswers,
} from "@/lib/coach/routine-builder";
import { refineRoutineRecommendations } from "@/lib/coach/routine-ai";
import { useLanguage } from "@/components/language-provider";
import { getCurrentProAccess } from "@/lib/subscription/revenuecat";

type StepId = "goals" | "lifestyle" | "sleep" | "workload" | "stress" | "fitnessLevel";
type Option<T extends string = string> = { value: T; label: string; detail: string; icon: string };

const GOAL_OPTIONS: Option[] = [
  { value: "energy", label: "Energy", detail: "Feel less drained", icon: "weather-sunny" },
  { value: "focus", label: "Focus", detail: "Protect attention", icon: "target" },
  { value: "fitness", label: "Fitness", detail: "Move more often", icon: "dumbbell" },
  { value: "sleep", label: "Sleep", detail: "Rest better", icon: "weather-night" },
  { value: "stress", label: "Stress", detail: "Stay calmer", icon: "meditation" },
  { value: "learning", label: "Learning", detail: "Study or read", icon: "book-open-variant" },
];

const LIFESTYLE_OPTIONS: Option<RoutineWizardAnswers["lifestyle"]>[] = [
  { value: "office", label: "Office", detail: "Desk-heavy days", icon: "desk" },
  { value: "student", label: "Student", detail: "Classes and study", icon: "school" },
  { value: "active", label: "Active", detail: "Already moving", icon: "run-fast" },
  { value: "home", label: "Home", detail: "Flexible routine", icon: "home" },
  { value: "mixed", label: "Mixed", detail: "Different day to day", icon: "shuffle-variant" },
];

const SLEEP_OPTIONS: Option<RoutineWizardAnswers["sleep"]>[] = [
  { value: "poor", label: "Poor", detail: "Often tired", icon: "sleep-off" },
  { value: "okay", label: "Okay", detail: "Some good nights", icon: "weather-night" },
  { value: "good", label: "Good", detail: "Mostly rested", icon: "check-circle" },
];

const WORKLOAD_OPTIONS: Option<RoutineWizardAnswers["workload"]>[] = [
  { value: "low", label: "Light", detail: "Room to experiment", icon: "speedometer-slow" },
  { value: "normal", label: "Normal", detail: "A steady week", icon: "speedometer-medium" },
  { value: "high", label: "Heavy", detail: "Keep it compact", icon: "speedometer" },
];

const STRESS_OPTIONS: Option<RoutineWizardAnswers["stress"]>[] = [
  { value: "low", label: "Low", detail: "Mostly steady", icon: "emoticon-happy-outline" },
  { value: "medium", label: "Medium", detail: "Comes and goes", icon: "emoticon-neutral-outline" },
  { value: "high", label: "High", detail: "Needs relief", icon: "alert-circle-outline" },
];

const FITNESS_OPTIONS: Option<RoutineWizardAnswers["fitnessLevel"]>[] = [
  { value: "beginner", label: "Beginner", detail: "Start gentle", icon: "seed-outline" },
  { value: "intermediate", label: "Intermediate", detail: "Some momentum", icon: "walk" },
  { value: "advanced", label: "Advanced", detail: "Ready for more", icon: "arm-flex" },
];

const STEPS: { id: StepId; title: string; subtitle: string }[] = [
  {
    id: "goals",
    title: "What do you want to improve?",
    subtitle: "Pick any goals that matter this week.",
  },
  {
    id: "lifestyle",
    title: "What does your day look like?",
    subtitle: "This shapes the kind of habits I suggest.",
  },
  {
    id: "sleep",
    title: "How is your sleep lately?",
    subtitle: "Sleep decides how ambitious the routine should be.",
  },
  {
    id: "workload",
    title: "How busy are your days?",
    subtitle: "A good routine has to survive real life.",
  },
  {
    id: "stress",
    title: "How stressed do you feel?",
    subtitle: "Stress changes the first habits worth building.",
  },
  {
    id: "fitnessLevel",
    title: "Where is your fitness level?",
    subtitle: "Movement goals should feel doable from day one.",
  },
];

const INITIAL_ANSWERS: RoutineWizardAnswers = {
  goals: [],
  lifestyle: "mixed",
  sleep: "okay",
  workload: "normal",
  stress: "medium",
  fitnessLevel: "beginner",
};

export default function HabitWizardScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [answers, setAnswers] = useState<RoutineWizardAnswers>(INITIAL_ANSWERS);
  const [stepIndex, setStepIndex] = useState(0);
  const [recommendations, setRecommendations] = useState<HabitRecommendation[] | null>(null);
  const [generatedByAi, setGeneratedByAi] = useState(false);
  const [showRoutineUpgrade, setShowRoutineUpgrade] = useState(false);
  const [loadingRoutine, setLoadingRoutine] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const step = STEPS[stepIndex];
  const selectedCount = recommendations?.filter((item) => item.selected).length ?? 0;

  function toggleGoal(goal: string) {
    setAnswers((current) => ({
      ...current,
      goals: current.goals.includes(goal)
        ? current.goals.filter((item) => item !== goal)
        : [...current.goals, goal],
    }));
  }

  function updateRecommendation(id: string, patch: Partial<HabitRecommendation>) {
    setRecommendations(
      (current) => current?.map((item) => (item.id === id ? { ...item, ...patch } : item)) ?? null,
    );
  }

  async function buildRoutine() {
    if (answers.goals.length === 0) {
      Alert.alert(t("Choose a goal"), t("Pick at least one goal so I can tailor your routine."));
      return;
    }
    const local = buildRoutineRecommendations(answers);
    setRecommendations(local);
    setShowRoutineUpgrade(false);
    const access = await getCurrentProAccess();
    if (!access.hasPro) {
      setGeneratedByAi(false);
      setShowRoutineUpgrade(true);
      return;
    }
    setLoadingRoutine(true);
    const refined = await refineRoutineRecommendations(answers, local);
    setRecommendations(refined.recommendations);
    setGeneratedByAi(refined.generated);
    setLoadingRoutine(false);
  }

  async function createRoutine() {
    const selected = recommendations?.filter((item) => item.selected) ?? [];
    if (selected.length === 0) {
      Alert.alert(t("Choose habits"), t("Keep at least one habit before creating your routine."));
      return;
    }

    setCreating(true);
    const results = await Promise.all(
      selected.map((item) =>
        createHabit({
          name: item.name,
          description: item.description,
          icon: item.icon,
          color: item.color,
          unit: item.unit,
          target: item.target,
          remindersEnabled: item.remindersEnabled,
          reminderTimes: item.reminderTimes,
          reminderDays: item.reminderDays,
          habitType: item.habitType,
          metricType: item.metricType,
          visualType: item.visualType,
          reminderStrategy: item.reminderStrategy,
          reminderIntervalMinutes: item.reminderIntervalMinutes,
          defaultLogValue: item.defaultLogValue,
          mergeSimilar: item.mergeSimilar,
        }),
      ),
    );
    setCreating(false);

    const failures = results
      .map((result, i) => {
        if (result.ok) return null;
        const validationMessage =
          "validation" in result && result.validation?.message ? result.validation.message : null;
        return `${selected[i].name}: ${validationMessage ?? result.error ?? t("Could not create habit.")}`;
      })
      .filter((msg): msg is string => msg !== null);

    if (failures.length > 0) {
      Alert.alert(t("Some habits were not created"), failures.join("\n"));
      return;
    }
    if (results.some((result) => result.queued)) {
      Alert.alert(t("Saved offline"), t("I'll sync this when you're back online."));
    }
    router.replace("/");
  }

  if (recommendations) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <WizardHeader title="Your Routine" onBack={() => setRecommendations(null)} />
          <View className="px-margin-mobile gap-md">
            <View className="bg-primary-fixed dark:bg-d-surface-container rounded-xl p-md gap-xs">
              <Text className="text-label-lg text-primary">
                {generatedByAi ? t("AI-REFINED ROUTINE") : t("SMART STARTER ROUTINE")}
              </Text>
              <Text className="text-body-md text-on-background dark:text-d-on-background font-semibold">
                {t(selectedCount === 1 ? "{count} habit selected" : "{count} habits selected", {
                  count: selectedCount,
                })}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t("Review the suggestions, edit the basics, then create your routine.")}
              </Text>
              {loadingRoutine && (
                <View className="flex-row items-center gap-xs pt-xs">
                  <ActivityIndicator size="small" color="#F26B1F" />
                  <Text className="text-label-sm text-primary">
                    {t("Checking for AI refinements...")}
                  </Text>
                </View>
              )}
            </View>

            {showRoutineUpgrade && (
              <ProUpgradeBanner
                title="Unlock AI routine refinement"
                body="Subscribe to refine starter routines with Pro AI."
                actionLabel="View plans"
                onAction={() => router.push("/pro" as never)}
              />
            )}

            {recommendations.map((item) => {
              const editing = editingId === item.id;
              return (
                <View
                  key={item.id}
                  className="bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-md gap-sm"
                >
                  <View className="flex-row items-start gap-md">
                    <View
                      className={`w-12 h-12 rounded-full items-center justify-center ${item.selected ? "bg-primary-fixed" : "bg-surface-container dark:bg-d-surface-container"}`}
                    >
                      <Icon
                        name={item.icon}
                        size={24}
                        color={item.selected ? "#F26B1F" : "#8F8A82"}
                      />
                    </View>
                    <View className="flex-1 gap-xs">
                      {editing ? (
                        <TextInput
                          className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-xs text-body-md"
                          value={item.name}
                          onChangeText={(name) => updateRecommendation(item.id, { name })}
                          placeholder={t("Habit name")}
                          placeholderTextColor="#8F8A82"
                        />
                      ) : (
                        <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                          {t(item.name)}
                        </Text>
                      )}
                      <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                        {item.description ? t(item.description) : null}
                      </Text>
                      <Text className="text-label-sm text-primary">{t(item.reason)}</Text>
                    </View>
                    <TouchableOpacity
                      className={`w-9 h-9 rounded-full items-center justify-center ${item.selected ? "bg-primary" : "bg-surface-container dark:bg-d-surface-container"}`}
                      onPress={() => updateRecommendation(item.id, { selected: !item.selected })}
                    >
                      <MaterialCommunityIcons
                        name={item.selected ? "check" : "plus"}
                        size={20}
                        color={item.selected ? "#ffffff" : "#F26B1F"}
                      />
                    </TouchableOpacity>
                  </View>

                  {editing && (
                    <View className="flex-row gap-sm">
                      <View className="flex-1">
                        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mb-xs">
                          {t("TARGET")}
                        </Text>
                        <TextInput
                          className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-xs text-body-md"
                          value={item.target == null ? "" : String(item.target)}
                          onChangeText={(value) =>
                            updateRecommendation(item.id, { target: parseTarget(value) })
                          }
                          keyboardType="decimal-pad"
                          placeholder={t("Optional")}
                          placeholderTextColor="#8F8A82"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mb-xs">
                          {t("UNIT")}
                        </Text>
                        <TextInput
                          className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-xs text-body-md"
                          value={item.unit}
                          onChangeText={(unit) => updateRecommendation(item.id, { unit })}
                          placeholder={t("min, pages...")}
                          placeholderTextColor="#8F8A82"
                        />
                      </View>
                    </View>
                  )}

                  <View className="flex-row gap-sm">
                    <TouchableOpacity
                      className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-full py-xs items-center"
                      onPress={() => setEditingId(editing ? null : item.id)}
                    >
                      <Text className="text-label-lg text-primary font-semibold">
                        {editing ? t("Done") : t("Edit")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-full py-xs items-center"
                      onPress={() => updateRecommendation(item.id, { selected: false })}
                    >
                      <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant font-semibold">
                        {t("Remove")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            <TouchableOpacity
              className={`rounded-full py-md items-center ${creating ? "bg-outline" : "bg-primary"}`}
              onPress={createRoutine}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-on-primary text-label-lg font-semibold">
                  {t("Create routine")}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <WizardHeader title="Habit Builder" onBack={() => router.back()} />
        <View className="px-margin-mobile gap-lg">
          <View className="gap-xs">
            <Text className="text-label-lg text-primary">
              {t("STEP {current} OF {total}", { current: stepIndex + 1, total: STEPS.length })}
            </Text>
            <Text className="text-headline-lg text-on-background dark:text-d-on-background font-bold">
              {t(step.title)}
            </Text>
            <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
              {t(step.subtitle)}
            </Text>
          </View>

          <View className="gap-sm">
            {step.id === "goals" &&
              GOAL_OPTIONS.map((option) => (
                <ChoiceRow
                  key={option.value}
                  option={option}
                  selected={answers.goals.includes(option.value)}
                  onPress={() => toggleGoal(option.value)}
                />
              ))}
            {step.id === "lifestyle" &&
              LIFESTYLE_OPTIONS.map((option) => (
                <ChoiceRow
                  key={option.value}
                  option={option}
                  selected={answers.lifestyle === option.value}
                  onPress={() => setAnswers((current) => ({ ...current, lifestyle: option.value }))}
                />
              ))}
            {step.id === "sleep" &&
              SLEEP_OPTIONS.map((option) => (
                <ChoiceRow
                  key={option.value}
                  option={option}
                  selected={answers.sleep === option.value}
                  onPress={() => setAnswers((current) => ({ ...current, sleep: option.value }))}
                />
              ))}
            {step.id === "workload" &&
              WORKLOAD_OPTIONS.map((option) => (
                <ChoiceRow
                  key={option.value}
                  option={option}
                  selected={answers.workload === option.value}
                  onPress={() => setAnswers((current) => ({ ...current, workload: option.value }))}
                />
              ))}
            {step.id === "stress" &&
              STRESS_OPTIONS.map((option) => (
                <ChoiceRow
                  key={option.value}
                  option={option}
                  selected={answers.stress === option.value}
                  onPress={() => setAnswers((current) => ({ ...current, stress: option.value }))}
                />
              ))}
            {step.id === "fitnessLevel" &&
              FITNESS_OPTIONS.map((option) => (
                <ChoiceRow
                  key={option.value}
                  option={option}
                  selected={answers.fitnessLevel === option.value}
                  onPress={() =>
                    setAnswers((current) => ({ ...current, fitnessLevel: option.value }))
                  }
                />
              ))}
          </View>

          <View className="flex-row gap-sm">
            <TouchableOpacity
              className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-full py-md items-center"
              onPress={() => (stepIndex === 0 ? router.back() : setStepIndex((value) => value - 1))}
            >
              <Text className="text-label-lg text-primary font-semibold">
                {stepIndex === 0 ? t("Cancel") : t("Back")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-primary rounded-full py-md items-center"
              onPress={() =>
                stepIndex === STEPS.length - 1 ? buildRoutine() : setStepIndex((value) => value + 1)
              }
            >
              <Text className="text-label-lg text-on-primary font-semibold">
                {stepIndex === STEPS.length - 1 ? t("Build routine") : t("Next")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function WizardHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useLanguage();
  return (
    <View className="flex-row items-center px-margin-mobile py-sm">
      <TouchableOpacity onPress={onBack} className="mr-md">
        <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
      </TouchableOpacity>
      <Text className="text-headline-md text-on-background dark:text-d-on-background">
        {t(title)}
      </Text>
    </View>
  );
}

function ChoiceRow({
  option,
  selected,
  onPress,
}: {
  option: Option;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  return (
    <TouchableOpacity
      className={`flex-row items-center rounded-xl p-md gap-md ${selected ? "bg-primary-fixed dark:bg-d-surface-high" : "bg-surface-lowest dark:bg-d-surface-lowest"}`}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View
        className={`w-11 h-11 rounded-full items-center justify-center ${selected ? "bg-primary" : "bg-surface-container dark:bg-d-surface-container"}`}
      >
        <MaterialCommunityIcons
          name={option.icon as keyof typeof MaterialCommunityIcons.glyphMap}
          size={21}
          color={selected ? "#ffffff" : "#F26B1F"}
        />
      </View>
      <View className="flex-1">
        <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
          {t(option.label)}
        </Text>
        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
          {t(option.detail)}
        </Text>
      </View>
      <MaterialCommunityIcons
        name={selected ? "check-circle" : "circle-outline"}
        size={22}
        color={selected ? "#F26B1F" : "#8F8A82"}
      />
    </TouchableOpacity>
  );
}

function parseTarget(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
