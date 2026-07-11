import {
  getTutorialHabitAction,
  type CreatedHabit,
  type TutorialHabitAction,
} from "./post-onboarding.ts";

export type FirstLogFlowPhase = "tutorial" | "celebration" | "notification" | "done";

export type FirstLogFlowState = {
  phase: FirstLogFlowPhase;
  actionInFlight: boolean;
  error: string | null;
};

export type FirstLogFlowEvent =
  | { type: "action_started" }
  | { type: "action_succeeded" }
  | { type: "action_failed"; error: string }
  | { type: "celebration_continued"; offerNotifications: boolean }
  | { type: "notification_resolved" }
  | { type: "skipped" }
  | { type: "back_pressed" };

export const initialFirstLogFlowState: FirstLogFlowState = {
  phase: "tutorial",
  actionInFlight: false,
  error: null,
};

export function firstLogFlowReducer(
  state: FirstLogFlowState,
  event: FirstLogFlowEvent,
): FirstLogFlowState {
  if (event.type === "skipped" || event.type === "back_pressed") {
    return { phase: "done", actionInFlight: false, error: null };
  }
  if (event.type === "action_started") {
    if (state.phase !== "tutorial" || state.actionInFlight) return state;
    return { ...state, actionInFlight: true, error: null };
  }
  if (event.type === "action_failed") {
    if (state.phase !== "tutorial") return state;
    return { phase: "tutorial", actionInFlight: false, error: event.error };
  }
  if (event.type === "action_succeeded") {
    if (state.phase !== "tutorial") return state;
    return { phase: "celebration", actionInFlight: false, error: null };
  }
  if (event.type === "celebration_continued") {
    if (state.phase !== "celebration") return state;
    return {
      phase: event.offerNotifications ? "notification" : "done",
      actionInFlight: false,
      error: null,
    };
  }
  if (event.type === "notification_resolved") {
    if (state.phase !== "notification") return state;
    return { phase: "done", actionInFlight: false, error: null };
  }
  return state;
}

export function createFirstLogActionGuard() {
  let inFlight = false;
  return {
    tryStart(): boolean {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    finish(): void {
      inFlight = false;
    },
    isInFlight(): boolean {
      return inFlight;
    },
  };
}

export type FirstStepPresentation =
  | {
      kind: "quantity";
      habitName: string;
      amount: number;
      unit: string;
      action: Extract<TutorialHabitAction, { kind: "log_progress" }>;
    }
  | {
      kind: "boolean";
      habitName: string;
      action: Extract<TutorialHabitAction, { kind: "complete" }>;
    };

export function buildFirstStepPresentation(habit: CreatedHabit): FirstStepPresentation {
  const action = getTutorialHabitAction(habit);
  if (action.kind === "log_progress") {
    return {
      kind: "quantity",
      habitName: habit.name,
      amount: action.value,
      unit: habit.unit,
      action,
    };
  }
  return { kind: "boolean", habitName: habit.name, action };
}

export type FirstLogNotificationPermission = "granted" | "denied" | "undetermined";

const FIRST_LOG_NOTIFICATION_OFFER_PREFIX = "habbit:first-log-notification-offered:";

export function firstLogNotificationOfferKey(userId: string): string {
  return `${FIRST_LOG_NOTIFICATION_OFFER_PREFIX}${userId}`;
}

export function shouldOfferFirstLogNotification(
  status: FirstLogNotificationPermission,
  alreadyOffered: boolean,
): boolean {
  return status === "undetermined" && !alreadyOffered;
}

export type FirstLogNotificationDependencies = {
  getPermissionStatus: () => Promise<FirstLogNotificationPermission>;
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

export async function prepareFirstLogNotificationOffer(
  userId: string,
  dependencies: FirstLogNotificationDependencies,
): Promise<boolean> {
  if (!userId.trim()) return false;
  try {
    const status = await dependencies.getPermissionStatus();
    const key = firstLogNotificationOfferKey(userId);
    const alreadyOffered = (await dependencies.getItem(key)) === "1";
    if (!shouldOfferFirstLogNotification(status, alreadyOffered)) return false;
    await dependencies.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}
