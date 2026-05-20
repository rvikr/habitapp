import { localDateKey } from "../utils/date.ts";
import {
  maxSmartReminderCount,
  sanitizeSmartReminderPlanTimes,
  type SmartReminderDecisionContext,
} from "./smart-reminders.ts";

type ResolveAiSmartReminderOptions = {
  enabled: boolean;
  now?: Date;
  invoke?: (contexts: SmartReminderDecisionContext[]) => Promise<unknown>;
};

type AiSmartReminderPlan = {
  habitId: string;
  times: Date[];
};

export async function resolveAiSmartReminderPlans(
  contexts: SmartReminderDecisionContext[],
  options: ResolveAiSmartReminderOptions,
): Promise<Map<string, Date[]>> {
  const resolved = new Map<string, Date[]>();
  if (!options.enabled || contexts.length === 0) return resolved;

  try {
    const response = await (options.invoke ?? invokeSmartReminderPlans)(contexts);
    for (const plan of sanitizeAiSmartReminderPlans(response, contexts, options.now ?? new Date())) {
      resolved.set(plan.habitId, plan.times);
    }
  } catch {
    return resolved;
  }

  return resolved;
}

export function sanitizeAiSmartReminderPlans(
  input: unknown,
  contexts: SmartReminderDecisionContext[],
  now: Date,
): AiSmartReminderPlan[] {
  if (!isRecord(input) || !Array.isArray(input.plans)) return [];

  const contextById = new Map(contexts.map((context) => [context.habitId, context]));
  const plans: AiSmartReminderPlan[] = [];
  const seen = new Set<string>();

  for (const item of input.plans) {
    if (!isRecord(item) || typeof item.habitId !== "string" || seen.has(item.habitId)) continue;
    const context = contextById.get(item.habitId);
    if (!context) continue;

    const times = sanitizeSmartReminderPlanTimes(item.times, now, {
      maxCount: maxSmartReminderCount(context),
    });
    if (!times) continue;

    seen.add(item.habitId);
    plans.push({ habitId: item.habitId, times });
  }

  return plans;
}

async function invokeSmartReminderPlans(contexts: SmartReminderDecisionContext[]): Promise<unknown> {
  const { supabase, isSupabaseConfigured } = await import("../supabase/client");
  if (!isSupabaseConfigured()) return null;

  const now = contexts[0]?.now ?? new Date();
  const { data, error } = await supabase.functions.invoke("smart-reminders", {
    body: {
      date: localDateKey(now),
      contexts: contexts.map((context) => ({
        habitId: context.habitId,
        habitName: context.habitName,
        habitType: context.habitType,
        metricType: context.metricType,
        strategy: context.strategy,
        intervalMinutes: context.intervalMinutes,
        target: context.target,
        unit: context.unit,
        progress: {
          current: context.progress.current,
          target: context.progress.target,
          ratio: context.progress.ratio,
          label: context.progress.label,
        },
        completions: context.completions.slice(-14),
        manualTimes: context.manualTimes,
        reminderDays: context.reminderDays,
        streak: context.streak,
        typicalHour: context.typicalHour,
        currentTime: timeString(now),
      })),
    },
  });

  if (error) throw error;
  return data;
}

function timeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
