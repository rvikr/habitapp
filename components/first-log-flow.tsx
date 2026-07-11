import { useCallback, useReducer, useRef, useState } from "react";
import { BackHandler, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "@/components/icon";
import { useActivation } from "@/components/activation-provider";
import { useLanguage } from "@/components/language-provider";
import { logCompletionOnce, toggleHabit } from "@/lib/data/actions";
import { syncScheduledReminders } from "@/lib/data/reminder-sync";
import {
  buildFirstStepPresentation,
  createFirstLogActionGuard,
  firstLogFlowReducer,
  initialFirstLogFlowState,
  prepareFirstLogNotificationOffer,
} from "@/lib/coach/first-log-flow";
import type { CreatedHabit } from "@/lib/coach/post-onboarding";
import { formatAmount } from "@/lib/coach/habit-intelligence";
import { showAlert } from "@/lib/platform/alert";
import { getPermissionStatus, requestPermission } from "@/lib/platform/notifications";
import { getItem, setItem } from "@/lib/platform/storage";
import { trackActivationEvent } from "@/lib/services/analytics";

type Props = {
  userId: string;
  habit: CreatedHabit;
  onFinished: () => void;
};

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

export default function FirstLogFlow({ userId, habit, onFinished }: Props) {
  const { t } = useLanguage();
  const { analyticsContext } = useActivation();
  const [state, dispatch] = useReducer(firstLogFlowReducer, initialFirstLogFlowState);
  const [firstLogOperationId] = useState(() => Crypto.randomUUID());
  const [continuing, setContinuing] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const actionGuardRef = useRef(createFirstLogActionGuard());
  const continuationGuardRef = useRef(createFirstLogActionGuard());
  const notificationGuardRef = useRef(createFirstLogActionGuard());
  const finishedRef = useRef(false);
  const presentation = buildFirstStepPresentation(habit);

  const finishOnce = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished();
  }, [onFinished]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (
          actionGuardRef.current.isInFlight() ||
          continuationGuardRef.current.isInFlight() ||
          notificationGuardRef.current.isInFlight() ||
          state.actionInFlight ||
          continuing ||
          notificationBusy
        ) {
          return true;
        }
        dispatch({ type: "back_pressed" });
        finishOnce();
        return true;
      });
      return () => subscription.remove();
    }, [continuing, finishOnce, notificationBusy, state.actionInFlight]),
  );

  async function handleFirstAction() {
    if (finishedRef.current || !actionGuardRef.current.tryStart()) return;
    dispatch({ type: "action_started" });
    try {
      const result =
        presentation.action.kind === "log_progress"
          ? await logCompletionOnce(habit.id, firstLogOperationId, presentation.action.value)
          : await toggleHabit(habit.id, false, habit.target ?? null);
      if (!result.ok) {
        const message = result.error ?? t("Try again.");
        dispatch({ type: "action_failed", error: message });
        showAlert(
          t(
            presentation.action.kind === "log_progress"
              ? "Could not log progress"
              : "Could not complete habit",
          ),
          message,
        );
        return;
      }
      dispatch({ type: "action_succeeded" });
    } catch {
      const message = t("Try again.");
      dispatch({ type: "action_failed", error: message });
      showAlert(
        t(
          presentation.action.kind === "log_progress"
            ? "Could not log progress"
            : "Could not complete habit",
        ),
        message,
      );
    } finally {
      actionGuardRef.current.finish();
    }
  }

  function handleSkip() {
    if (finishedRef.current || actionGuardRef.current.isInFlight() || state.actionInFlight) {
      return;
    }
    dispatch({ type: "skipped" });
    finishOnce();
  }

  async function handleCelebrationContinue() {
    if (finishedRef.current || !continuationGuardRef.current.tryStart()) return;
    setContinuing(true);
    try {
      const offerNotifications = await prepareFirstLogNotificationOffer(userId, {
        getPermissionStatus,
        getItem,
        setItem,
      });
      if (offerNotifications) {
        trackActivationEvent(
          "notification_prompt_shown",
          { ...analyticsContext, stage: "first_log" },
          { surface: "first_log_flow" },
        );
      }
      dispatch({ type: "celebration_continued", offerNotifications });
      if (!offerNotifications) finishOnce();
    } finally {
      continuationGuardRef.current.finish();
      setContinuing(false);
    }
  }

  function resolveNotification() {
    dispatch({ type: "notification_resolved" });
    finishOnce();
  }

  async function handleEnableNotifications() {
    if (finishedRef.current || !notificationGuardRef.current.tryStart()) return;
    setNotificationBusy(true);
    try {
      const granted = await requestPermission();
      if (granted) await syncScheduledReminders();
    } catch {
      // Permission and reminder-sync failures must not trap first-run navigation.
    } finally {
      notificationGuardRef.current.finish();
      setNotificationBusy(false);
      resolveNotification();
    }
  }

  function handleMaybeLater() {
    if (finishedRef.current || !notificationGuardRef.current.tryStart()) return;
    try {
      resolveNotification();
    } finally {
      notificationGuardRef.current.finish();
    }
  }

  if (state.phase === "tutorial") {
    const isQuantity = presentation.kind === "quantity";
    const amount = isQuantity ? formatAmount(presentation.amount) : "";
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
          <View className="px-margin-mobile gap-lg pt-xl">
            <View className="gap-xs">
              <Text className="text-headline-lg text-on-background dark:text-d-on-background font-bold">
                {t(
                  isQuantity
                    ? "Let's log your first habit together"
                    : "Let's complete your first habit together",
                )}
              </Text>
              <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
                {isQuantity
                  ? t("Tap below to log {amount} {unit} for {name}. That's your first step.", {
                      amount,
                      unit: presentation.unit,
                      name: t(presentation.habitName),
                    })
                  : t("Tap below to mark {name} complete. That's your first win.", {
                      name: t(presentation.habitName),
                    })}
              </Text>
            </View>

            <HabitFocusCard habit={habit} amount={amount} />

            {state.error ? (
              <Text
                selectable
                accessibilityRole="alert"
                className="text-body-sm text-error dark:text-d-error text-center"
              >
                {state.error}
              </Text>
            ) : null}

            <TouchableOpacity
              className={`rounded-full py-md items-center ${state.actionInFlight ? "bg-outline" : "bg-primary"}`}
              onPress={handleFirstAction}
              disabled={state.actionInFlight}
              accessibilityRole="button"
              accessibilityLabel={
                state.actionInFlight
                  ? t(isQuantity ? "Logging..." : "Completing...")
                  : isQuantity
                    ? t("Log {amount} {unit}", { amount, unit: presentation.unit })
                    : t("Complete")
              }
              accessibilityState={{ disabled: state.actionInFlight }}
            >
              <Text className="text-on-primary text-label-lg font-semibold">
                {state.actionInFlight
                  ? t(isQuantity ? "Logging..." : "Completing...")
                  : isQuantity
                    ? t("Log {amount} {unit}", { amount, unit: presentation.unit })
                    : t("Complete")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="items-center py-sm"
              onPress={handleSkip}
              disabled={state.actionInFlight}
              accessibilityRole="button"
              accessibilityState={{ disabled: state.actionInFlight }}
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

  if (state.phase === "celebration") {
    const announcement =
      presentation.kind === "quantity"
        ? t("You logged {amount} {unit} for {name}.", {
            amount: formatAmount(presentation.amount),
            unit: presentation.unit,
            name: t(presentation.habitName),
          })
        : t("You completed {name}.", { name: t(presentation.habitName) });
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
          <View className="px-margin-mobile gap-lg pt-xl items-center">
            <View className="w-20 h-20 rounded-full bg-primary-fixed items-center justify-center">
              <MaterialCommunityIcons name="party-popper" size={40} color="#F26B1F" />
            </View>
            <View
              className="gap-xs items-center"
              accessible
              accessibilityRole="summary"
              accessibilityLiveRegion="polite"
              accessibilityLabel={`${t("First Step")}. ${announcement}`}
            >
              <Text
                accessibilityRole="header"
                className="text-headline-lg text-on-background dark:text-d-on-background font-bold text-center"
              >
                {t("First Step")}
              </Text>
              <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant text-center">
                {announcement}
              </Text>
            </View>
            <HabitFocusCard
              habit={habit}
              amount={presentation.kind === "quantity" ? formatAmount(presentation.amount) : ""}
            />
            <TouchableOpacity
              className={`self-stretch rounded-full py-md items-center ${continuing ? "bg-outline" : "bg-primary"}`}
              onPress={handleCelebrationContinue}
              disabled={continuing}
              accessibilityRole="button"
              accessibilityLabel={continuing ? t("Continuing...") : t("Continue")}
              accessibilityState={{ disabled: continuing }}
            >
              <Text className="text-on-primary text-label-lg font-semibold">
                {continuing ? t("Continuing...") : t("Continue")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (state.phase === "notification") {
    const showIosInstallGuide = Platform.OS === "web" && isIosBrowser() && !isStandalone();
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

            {!showIosInstallGuide ? (
              <TouchableOpacity
                className={`rounded-full py-md items-center ${notificationBusy ? "bg-outline" : "bg-primary"}`}
                onPress={handleEnableNotifications}
                disabled={notificationBusy}
                accessibilityRole="button"
                accessibilityLabel={notificationBusy ? t("Enabling...") : t("Enable reminders")}
                accessibilityState={{ disabled: notificationBusy }}
              >
                <Text className="text-on-primary text-label-lg font-semibold">
                  {notificationBusy ? t("Enabling...") : t("Enable reminders")}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              className="items-center py-sm"
              onPress={handleMaybeLater}
              disabled={notificationBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: notificationBusy }}
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

  return null;
}

function HabitFocusCard({ habit, amount }: { habit: CreatedHabit; amount: string }) {
  const { t } = useLanguage();
  return (
    <View className="self-stretch bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-lg items-center gap-md">
      <View className="w-20 h-20 rounded-full bg-primary-fixed items-center justify-center">
        <Icon name={habit.icon} size={36} color="#F26B1F" />
      </View>
      <Text className="text-headline-md text-on-surface dark:text-d-on-surface font-bold text-center">
        {t(habit.name)}
      </Text>
      {amount ? (
        <Text className="text-label-sm text-primary">
          {t("First log: +{amount} {unit}", { amount, unit: habit.unit })}
        </Text>
      ) : null}
      {habit.target != null ? (
        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
          {t(amount ? "Daily goal: {target} {unit}" : "Goal: {target} {unit}", {
            target: habit.target,
            unit: habit.unit,
          })}
        </Text>
      ) : null}
    </View>
  );
}
