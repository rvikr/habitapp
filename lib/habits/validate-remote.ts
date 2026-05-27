import { supabase } from "../supabase/client";
import type {
  HabitValidationCategory,
  HabitValidationInput,
  HabitValidationResult,
  HabitValidationStatus,
} from "./validate";

const VALID_STATUSES: HabitValidationStatus[] = ["ok", "warn", "block"];
const VALID_CATEGORIES: HabitValidationCategory[] = ["policy", "unhealthy", "impossible"];

function failOpen(
  source: "gemini" | "gemini_unavailable" = "gemini_unavailable",
): HabitValidationResult {
  return { status: "ok", category: null, message: null, suggestion: null, source };
}

function parseRemoteResult(payload: unknown): HabitValidationResult {
  if (typeof payload !== "object" || payload === null) return failOpen();
  const raw = payload as Record<string, unknown>;

  const status =
    typeof raw.status === "string" && VALID_STATUSES.includes(raw.status as HabitValidationStatus)
      ? (raw.status as HabitValidationStatus)
      : "ok";
  if (status === "ok") return failOpen("gemini");

  const category =
    typeof raw.category === "string" &&
    VALID_CATEGORIES.includes(raw.category as HabitValidationCategory)
      ? (raw.category as HabitValidationCategory)
      : null;
  const message =
    typeof raw.message === "string" && raw.message.trim().length > 0
      ? raw.message.trim().slice(0, 240)
      : null;

  let suggestion: HabitValidationResult["suggestion"] = null;
  if (typeof raw.suggestion === "object" && raw.suggestion !== null) {
    const s = raw.suggestion as Record<string, unknown>;
    const next: HabitValidationResult["suggestion"] = {};
    if (typeof s.target === "number" && Number.isFinite(s.target) && s.target > 0)
      next.target = s.target;
    if (typeof s.unit === "string" && s.unit.trim().length > 0)
      next.unit = s.unit.trim().slice(0, 16);
    if (typeof s.name === "string" && s.name.trim().length > 0)
      next.name = s.name.trim().slice(0, 80);
    if (Object.keys(next).length > 0) suggestion = next;
  }

  return { status, category, message, suggestion, source: "gemini" };
}

export async function validateHabitRemote(
  input: HabitValidationInput,
): Promise<HabitValidationResult> {
  try {
    const { data, error } = await supabase.functions.invoke("validate-habit", {
      body: {
        habit: {
          name: input.name,
          description: input.description,
          unit: input.unit,
          target: input.target,
          habitType: input.habitType,
          metricType: input.metricType,
        },
      },
    });
    if (error) return failOpen();
    return parseRemoteResult(data);
  } catch {
    return failOpen();
  }
}
