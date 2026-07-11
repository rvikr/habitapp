import type { HabitValidationResult } from "./validate";
import type { Habit } from "../../types/db";

export type HabitCreateFailureKind = "validation" | "network" | "auth" | "save";

export type HabitCreateSuccess = {
  ok: true;
  id: string;
  habit: Habit;
  merged?: true;
  migrated?: false;
};

export type HabitCreateFailure = {
  ok: false;
  id: null;
  error?: string;
  validation?: HabitValidationResult;
  failureKind: HabitCreateFailureKind;
};

export type HabitCreateResult = HabitCreateSuccess | HabitCreateFailure;

export type RoutineZeroSuccessCategory = "auth_lost" | "network" | "validation" | "save_failed";

function errorFields(error: unknown): { text: string; code: string; status: number | null } {
  if (typeof error === "string") return { text: error.toLowerCase(), code: "", status: null };
  if (!error || typeof error !== "object") {
    return { text: String(error ?? "").toLowerCase(), code: "", status: null };
  }
  const record = error as Record<string, unknown>;
  const text = [record.name, record.message, record.error, record.error_description]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  const numericStatus = Number(record.status);
  return { text, code, status: Number.isFinite(numericStatus) ? numericStatus : null };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Could not create habit.";
}

export function classifyHabitCreateError(
  error: unknown,
  fallbackKind: HabitCreateFailureKind = "save",
): HabitCreateFailureKind {
  const { text, code, status } = errorFields(error);
  if (
    status === 401 ||
    code === "PGRST301" ||
    text.includes("jwt expired") ||
    text.includes("invalid jwt") ||
    text.includes("auth session missing") ||
    text.includes("session missing") ||
    text.includes("invalid refresh token") ||
    text.includes("refresh token not found") ||
    text.includes("refresh_token_not_found") ||
    text.includes("not authenticated") ||
    text.includes("unauthorized")
  ) {
    return "auth";
  }
  if (
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("network request failed") ||
    text.includes("networkerror") ||
    text.includes("network error") ||
    text.includes("load failed")
  ) {
    return "network";
  }
  return fallbackKind;
}

export function createHabitFailure(
  error: unknown,
  fallbackKind: HabitCreateFailureKind = "save",
): HabitCreateFailure {
  return {
    ok: false,
    id: null,
    error: errorMessage(error),
    failureKind: classifyHabitCreateError(error, fallbackKind),
  };
}

export function routineZeroSuccessCategory(
  results: readonly HabitCreateResult[],
): RoutineZeroSuccessCategory {
  const failureKinds = new Set(
    results
      .filter((result): result is HabitCreateFailure => !result.ok)
      .map((result) => result.failureKind),
  );
  if (failureKinds.has("auth")) return "auth_lost";
  if (failureKinds.has("network")) return "network";
  if (failureKinds.has("validation")) return "validation";
  return "save_failed";
}

export async function runRoutineCreateSequence<T>(
  items: readonly T[],
  createOne: (item: T) => Promise<HabitCreateResult>,
): Promise<{ authLost: boolean; results: HabitCreateResult[] }> {
  const results: HabitCreateResult[] = [];
  for (const item of items) {
    let result: HabitCreateResult;
    try {
      result = await createOne(item);
    } catch (error) {
      result = createHabitFailure(error);
    }
    results.push(result);
    if (!result.ok && result.failureKind === "auth") {
      return { authLost: true, results };
    }
  }
  return { authLost: false, results };
}
