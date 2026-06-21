import { useCallback, useState } from "react";
import {
  BackHandler,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { showAlert } from "@/lib/platform/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Icon from "@/components/icon";
import { useCelebrate } from "@/components/celebration";
import { ProUpgradeBanner } from "@/components/pro-access-banner";
import { createRoutineHabits, toggleHabit } from "@/lib/data/actions";
import { requestPermission, getPermissionStatus } from "@/lib/platform/notifications";
import { syncScheduledReminders } from "@/lib/data/reminder-sync";
import {
  buildCreatedHabits,
  pickTutorialHabit,
  type CreatedHabit,
} from "@/lib/coach/post-onboarding";
import { completeCurrentUserOnboarding, markOnboardingComplete } from "@/lib/auth/onboarding";
import { getCurrentSession } from "@/lib/supabase/client";
import {
  buildRoutineRecommendations,
  type ActivityBaseline,
  type HabitRecommendation,
  type RoutineWizardAnswers,
} from "@/lib/coach/routine-builder";
import { refineRoutineRecommendations } from "@/lib/coach/routine-ai";
import { useLanguage } from "@/components/language-provider";
import { getCurrentProAccess } from "@/lib/subscription/revenuecat";

type StepId =
  | "goals"
  | "lifestyle"
  | "sleep"
  | "workload"
  | "stress"
  | "fitnessLevel"
  | "body"
  | "baseline";
type Option<T extends string = string> = { value: T; label: string; detail: string; icon: string };
type PostCreatePhase = "confirm" | "notifications" | "tutorial" | null;

// Web-only: iOS only allows push for installed (home-screen) PWAs, so on iOS
// Safari we guide the user to install instead of showing a non-functional
// Allow button (mirrors components/notification-permission-card.tsx).
function isIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

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

const STEPS_BASELINE_OPTIONS: Option<ActivityBaseline>[] = [
  {
    value: "low",
    label: "Barely move",
    detail: "Mostly sitting (under 3k steps)",
    icon: "seat-recline-normal",
  },
  { value: "some", label: "A little", detail: "Some walking (3–5k)", icon: "walk" },
  { value: "moderate", label: "Moderately active", detail: "On my feet a lot (5–8k)", icon: "run" },
  { value: "high", label: "Very active", detail: "Lots of walking (8k+)", icon: "run-fast" },
];

const WATER_BASELINE_OPTIONS: Option<ActivityBaseline>[] = [
  { value: "low", label: "Hardly any", detail: "0–2 glasses a day", icon: "cup-outline" },
  { value: "some", label: "Some", detail: "3–5 glasses", icon: "cup" },
  { value: "moderate", label: "A fair amount", detail: "6–8 glasses", icon: "cup-water" },
  { value: "high", label: "Lots", detail: "8+ glasses", icon: "water" },
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
  {
    id: "body",
    title: "A few details about you",
    subtitle:
      "Optional — lets me size your water and step goals to your body. Leave blank to skip.",
  },
  {
    id: "baseline",
    title: "Where are you starting from?",
    subtitle: "I set your first targets near what you already do, then build up. Optional.",
  },
];

const INITIAL_ANSWERS: RoutineWizardAnswers = {
  goals: [],
  lifestyle: "mixed",
  sleep: "okay",
  workload: "normal",
  stress: "medium",
  fitnessLevel: "beginner",
  age: null,
  heightCm: null,
  weightKg: null,
  stepsBaseline: null,
  waterBaseline: null,
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
  const [postPhase, setPostPhase] = useState<PostCreatePhase>(null);
  const [needsNotifPrimer, setNeedsNotifPrimer] = useState(false);
  const [createdHabits, setCreatedHabits] = useState<CreatedHabit[]>([]);
  const [tutorialCompleting, setTutorialCompleting] = useState(false);
  const celebrate = useCelebrate();

  const step = STEPS[stepIndex];
  const selectedCount = recommendations?.filter((item) => item.selected).length ?? 0;
  const tutorialHabit = pickTutorialHabit(createdHabits);

  // While in a post-create phase, consume Android back: tutorial -> confirm,
  // confirm -> dashboard. Never let it fall back into the wizard/review screen.
  useFocusEffect(
    useCallback(() => {
      if (postPhase === null) return;
      const onBack = () => {
        if (postPhase === "tutorial") {
          setPostPhase("confirm");
          return true;
        }
        router.replace("/?newUser=1");
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [postPhase, router]),
  );

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

  async function handleExitWizard() {
    await completeCurrentUserOnboarding();
    router.replace("/?newUser=1");
  }

  function handleNextStep() {
    if (step.id === "goals" && answers.goals.length === 0) {
      showAlert(t("Choose a goal"), t("Pick at least one goal so I can tailor your routine."));
      return;
    }
    setStepIndex((value) => value + 1);
  }

  async function buildRoutine() {
    if (answers.goals.length === 0) {
      showAlert(t("Choose a goal"), t("Pick at least one goal so I can tailor your routine."));
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
    if (creating) return;
    const selected = recommendations?.filter((item) => item.selected) ?? [];
    if (selected.length === 0) {
      showAlert(t("Choose habits"), t("Keep at least one habit before creating your routine."));
      return;
    }

    setCreating(true);
    const { signedOut, results } = await createRoutineHabits(
      selected.map((item) => ({
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
      })),
    );
    setCreating(false);

    // The auth check now happens once for the whole batch, so "sign in again"
    // can only mean a genuine signed-out state — show it once, not per habit.
    if (signedOut) {
      showAlert(t("Some habits were not created"), t("You need to sign in again."));
      return;
    }

    const failures = results
      .map((result, i) => {
        if (result.ok) return null;
        const validationMessage =
          "validation" in result && result.validation?.message ? result.validation.message : null;
        return `${selected[i].name}: ${validationMessage ?? result.error ?? t("Could not create habit.")}`;
      })
      .filter((msg): msg is string => msg !== null);

    if (failures.length > 0) {
      showAlert(t("Some habits were not created"), failures.join("\n"));
      return;
    }

    // Routine creation succeeded — record onboarding as done so the dashboard
    // never auto-launches the wizard for this user again.
    const session = await getCurrentSession();
    if (session?.user?.id) void markOnboardingComplete(session.user.id);

    const created = buildCreatedHabits(selected, results);
    if (created.length === 0) {
      router.replace("/?newUser=1"); // nothing to celebrate; straight to dashboard
      return;
    }
    setCreatedHabits(created);
    // Only show the notification primer when permission hasn't been decided yet.
    const status = await getPermissionStatus();
    setNeedsNotifPrimer(status === "undetermined");
    setPostPhase("confirm");
  }

  async function handleTutorialComplete() {
    if (tutorialCompleting) return;
    const habit = pickTutorialHabit(createdHabits);
    if (!habit) {
      router.replace("/?newUser=1");
      return;
    }
    setTutorialCompleting(true);
    const result = await toggleHabit(habit.id, false, habit.target ?? null);
    setTutorialCompleting(false);
    if (!result.ok) {
      showAlert(t("Could not complete habit"), result.error ?? t("Try again."));
      return; // stay on tutorial to retry or skip
    }
    celebrate(
      t("🎉 Great Start! 1 of {total} habits completed today.", { total: createdHabits.length }),
    );
    router.replace("/?newUser=1");
  }

  if (postPhase === "confirm") {
    return (
      <ConfirmScreen
        habits={createdHabits}
        onContinue={() => setPostPhase(needsNotifPrimer ? "notifications" : "tutorial")}
      />
    );
  }

  if (postPhase === "notifications") {
    return <NotificationPrimerScreen onResolved={() => setPostPhase("tutorial")} />;
  }

  if (postPhase === "tutorial" && tutorialHabit) {
    return (
      <TutorialScreen
        habit={tutorialHabit}
        completing={tutorialCompleting}
        onComplete={handleTutorialComplete}
        onSkip={handleExitWizard}
      />
    );
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
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t("Targets are general wellness guidance, not medical advice.")}
              </Text>
              {loadingRoutine && (
                <View className="flex-row items-center gap-xs pt-xs">
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
                      accessibilityRole="button"
                      accessibilityLabel={t(item.selected ? "Remove {label}" : "Add {label}", {
                        label: t(item.name),
                      })}
                      accessibilityState={{ selected: item.selected }}
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
                      accessibilityRole="button"
                      accessibilityLabel={t(editing ? "Finish editing {label}" : "Edit {label}", {
                        label: t(item.name),
                      })}
                    >
                      <Text className="text-label-lg text-primary font-semibold">
                        {editing ? t("Done") : t("Edit")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-full py-xs items-center"
                      onPress={() => updateRecommendation(item.id, { selected: false })}
                      accessibilityRole="button"
                      accessibilityLabel={t("Remove {label}", { label: t(item.name) })}
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
              accessibilityRole="button"
              accessibilityLabel={creating ? t("Creating routine...") : t("Create routine")}
              accessibilityState={{ disabled: creating }}
            >
              <Text className="text-on-primary text-label-lg font-semibold">
                {creating ? t("Creating routine...") : t("Create routine")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
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
            {step.id === "body" && (
              <BodyMetricsStep
                age={answers.age ?? null}
                heightCm={answers.heightCm ?? null}
                weightKg={answers.weightKg ?? null}
                onChange={(patch) => setAnswers((current) => ({ ...current, ...patch }))}
              />
            )}
            {step.id === "baseline" && (
              <View className="gap-lg">
                <View className="gap-sm">
                  <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant">
                    {t("How much do you walk on a normal day?")}
                  </Text>
                  {STEPS_BASELINE_OPTIONS.map((option) => (
                    <ChoiceRow
                      key={option.value}
                      option={option}
                      selected={answers.stepsBaseline === option.value}
                      onPress={() =>
                        setAnswers((current) => ({
                          ...current,
                          stepsBaseline:
                            current.stepsBaseline === option.value ? null : option.value,
                        }))
                      }
                    />
                  ))}
                </View>
                <View className="gap-sm">
                  <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant">
                    {t("How much water do you drink now?")}
                  </Text>
                  {WATER_BASELINE_OPTIONS.map((option) => (
                    <ChoiceRow
                      key={option.value}
                      option={option}
                      selected={answers.waterBaseline === option.value}
                      onPress={() =>
                        setAnswers((current) => ({
                          ...current,
                          waterBaseline:
                            current.waterBaseline === option.value ? null : option.value,
                        }))
                      }
                    />
                  ))}
                </View>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  {t(
                    "Targets are general wellness guidance, not medical advice. Adjust any of them before creating your routine.",
                  )}
                </Text>
              </View>
            )}
          </View>

          <View className="flex-row gap-sm">
            <TouchableOpacity
              className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-full py-md items-center"
              onPress={() =>
                stepIndex === 0 ? handleExitWizard() : setStepIndex((value) => value - 1)
              }
              accessibilityRole="button"
            >
              <Text className="text-label-lg text-primary font-semibold">
                {stepIndex === 0 ? t("Cancel") : t("Back")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-primary rounded-full py-md items-center"
              onPress={() => (stepIndex === STEPS.length - 1 ? buildRoutine() : handleNextStep())}
              accessibilityRole="button"
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

function ConfirmScreen({ habits, onContinue }: { habits: CreatedHabit[]; onContinue: () => void }) {
  const { t } = useLanguage();
  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-margin-mobile gap-lg pt-xl">
          <View className="items-center gap-md">
            <View className="w-16 h-16 rounded-full bg-primary-fixed items-center justify-center">
              <MaterialCommunityIcons name="party-popper" size={32} color="#F26B1F" />
            </View>
            <View className="items-center gap-xs">
              <Text className="text-headline-lg text-on-background dark:text-d-on-background font-bold text-center">
                {t("Your routine is ready")}
              </Text>
              <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant text-center">
                {t(
                  habits.length === 1
                    ? "{count} habit, ready to go."
                    : "{count} habits, ready to go.",
                  { count: habits.length },
                )}
              </Text>
            </View>
          </View>

          <View className="gap-sm">
            {habits.map((habit) => (
              <View
                key={habit.id}
                className="bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-md flex-row items-center gap-md"
              >
                <View className="w-12 h-12 rounded-full bg-primary-fixed items-center justify-center">
                  <Icon name={habit.icon} size={24} color="#F26B1F" />
                </View>
                <View className="flex-1 gap-xs">
                  <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                    {t(habit.name)}
                  </Text>
                  {habit.target != null && (
                    <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                      {t("Goal: {target} {unit}", { target: habit.target, unit: habit.unit })}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            className="bg-primary rounded-full py-md items-center"
            onPress={onContinue}
            accessibilityRole="button"
          >
            <Text className="text-on-primary text-label-lg font-semibold">{t("Let's begin")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NotificationPrimerScreen({ onResolved }: { onResolved: () => void }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  // On iOS Safari (not installed) push isn't available yet — guide the user to
  // install the PWA instead of showing a non-functional Allow button.
  const showIosInstallGuide = Platform.OS === "web" && isIosBrowser() && !isStandalone();

  async function handleEnable() {
    if (busy) return;
    setBusy(true);
    const granted = await requestPermission();
    // Reminders were created with permission still undetermined, so the initial
    // sync no-oped. Schedule them now that the user has granted access.
    if (granted) await syncScheduledReminders();
    setBusy(false);
    onResolved();
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-margin-mobile gap-lg pt-xl">
          <View className="items-center gap-md">
            <View className="w-16 h-16 rounded-full bg-primary-fixed items-center justify-center">
              <MaterialCommunityIcons name="bell-ring" size={32} color="#F26B1F" />
            </View>
            <View className="items-center gap-xs">
              <Text className="text-headline-lg text-on-background dark:text-d-on-background font-bold text-center">
                {t("Stay on track with reminders")}
              </Text>
              <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant text-center">
                {showIosInstallGuide
                  ? t(
                      "Tap Share → Add to Home Screen, then open Lagan from your home screen to enable notifications.",
                    )
                  : t(
                      "Allow notifications so we can nudge you at your reminder times. If several habits share a time, we'll bundle them into one reminder.",
                    )}
              </Text>
            </View>
          </View>

          {!showIosInstallGuide && (
            <TouchableOpacity
              className={`rounded-full py-md items-center ${busy ? "bg-outline" : "bg-primary"}`}
              onPress={handleEnable}
              accessibilityRole="button"
              accessibilityLabel={busy ? t("Enabling...") : t("Enable reminders")}
              accessibilityState={{ disabled: busy }}
            >
              <Text className="text-on-primary text-label-lg font-semibold">
                {busy ? t("Enabling...") : t("Enable reminders")}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            className="items-center py-sm"
            onPress={() => {
              if (!busy) onResolved();
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
          >
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant font-semibold">
              {showIosInstallGuide ? t("Continue") : t("Maybe later")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TutorialScreen({
  habit,
  completing,
  onComplete,
  onSkip,
}: {
  habit: CreatedHabit;
  completing: boolean;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const { t } = useLanguage();
  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-margin-mobile gap-lg pt-xl">
          <View className="gap-xs">
            <Text className="text-headline-lg text-on-background dark:text-d-on-background font-bold">
              {t("Let's complete your first habit together")}
            </Text>
            <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
              {t("Tap below to mark {name} complete. That's your first win.", {
                name: t(habit.name),
              })}
            </Text>
          </View>

          <View className="bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-lg items-center gap-md">
            <View className="w-20 h-20 rounded-full bg-primary-fixed items-center justify-center">
              <Icon name={habit.icon} size={36} color="#F26B1F" />
            </View>
            <Text className="text-headline-md text-on-surface dark:text-d-on-surface font-bold text-center">
              {t(habit.name)}
            </Text>
            {habit.target != null && (
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t("Goal: {target} {unit}", { target: habit.target, unit: habit.unit })}
              </Text>
            )}
          </View>

          <TouchableOpacity
            className={`rounded-full py-md items-center ${completing ? "bg-outline" : "bg-primary"}`}
            onPress={onComplete}
            accessibilityRole="button"
            accessibilityLabel={completing ? t("Completing...") : t("Complete")}
            accessibilityState={{ disabled: completing }}
          >
            <Text className="text-on-primary text-label-lg font-semibold">
              {completing ? t("Completing...") : t("Complete")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="items-center py-sm"
            onPress={() => {
              if (!completing) onSkip();
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: completing }}
          >
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant font-semibold">
              {t("Skip for now")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function WizardHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useLanguage();
  return (
    <View className="flex-row items-center px-margin-mobile py-sm">
      <TouchableOpacity
        onPress={onBack}
        className="mr-md"
        accessibilityRole="button"
        accessibilityLabel={t("Go back")}
      >
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
      accessibilityRole="button"
      accessibilityLabel={t("Select {label}", { label: t(option.label) })}
      accessibilityState={{ selected }}
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

function BodyMetricsStep({
  age,
  heightCm,
  weightKg,
  onChange,
}: {
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  onChange: (patch: Partial<RoutineWizardAnswers>) => void;
}) {
  const { t } = useLanguage();
  return (
    <View className="gap-md">
      <NumberField
        label={t("Age")}
        unit={t("years")}
        placeholder={t("e.g. 30")}
        initial={age}
        allowDecimal={false}
        onChangeValue={(value) => onChange({ age: value })}
      />
      <NumberField
        label={t("Height")}
        unit={t("cm")}
        placeholder={t("e.g. 170")}
        initial={heightCm}
        allowDecimal={false}
        onChangeValue={(value) => onChange({ heightCm: value })}
      />
      <NumberField
        label={t("Weight")}
        unit={t("kg")}
        placeholder={t("e.g. 70")}
        initial={weightKg}
        allowDecimal
        onChangeValue={(value) => onChange({ weightKg: value })}
      />
      <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
        {t(
          "We use this only to set realistic water and step targets. Leave blank to use standard goals.",
        )}
      </Text>
    </View>
  );
}

function NumberField({
  label,
  unit,
  placeholder,
  initial,
  allowDecimal,
  onChangeValue,
}: {
  label: string;
  unit: string;
  placeholder: string;
  initial: number | null;
  allowDecimal: boolean;
  onChangeValue: (value: number | null) => void;
}) {
  const [text, setText] = useState(initial == null ? "" : String(initial));
  return (
    <View className="gap-xs">
      <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
        {label}
      </Text>
      <View className="flex-row items-center bg-surface-lowest dark:bg-d-surface-lowest rounded-xl px-md">
        <TextInput
          className="flex-1 text-on-surface dark:text-d-on-surface text-body-md py-md"
          value={text}
          onChangeText={(raw) => {
            // Keep only digits (plus one optional dot for weight). Local string
            // state keeps typing smooth; only a valid positive number is lifted up.
            const cleaned = allowDecimal
              ? raw.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
              : raw.replace(/[^0-9]/g, "");
            setText(cleaned);
            const parsed = Number(cleaned);
            onChangeValue(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
          }}
          keyboardType={allowDecimal ? "decimal-pad" : "number-pad"}
          placeholder={placeholder}
          placeholderTextColor="#8F8A82"
          maxLength={allowDecimal ? 6 : 3}
        />
        <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant ml-sm">
          {unit}
        </Text>
      </View>
    </View>
  );
}

function parseTarget(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
