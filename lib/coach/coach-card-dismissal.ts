import type { CoachSignal } from "./coach.ts";
import { localDateKey } from "../utils/date.ts";

export type CoachCardDismissalStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type DismissalRecord = { date: string; keys: string[] };

const DISMISSED_KEY = "habbit:coach-card:dismissed";

function signalDismissalKey(signal: Pick<CoachSignal, "kind" | "habitId">): string {
  return `${signal.kind}:${signal.habitId}`;
}

// A single record keyed by local date: reading under a different date discards
// the stored keys, so dismissals reset each morning without any cleanup pass.
async function readRecord(
  storage: CoachCardDismissalStorage,
  todayKey: string,
): Promise<DismissalRecord> {
  try {
    const raw = await storage.getItem(DISMISSED_KEY);
    if (!raw) return { date: todayKey, keys: [] };
    const parsed = JSON.parse(raw) as Partial<DismissalRecord>;
    if (parsed.date !== todayKey || !Array.isArray(parsed.keys)) {
      return { date: todayKey, keys: [] };
    }
    return { date: todayKey, keys: parsed.keys.filter((key) => typeof key === "string") };
  } catch {
    return { date: todayKey, keys: [] };
  }
}

export async function isCoachCardDismissed(
  signal: Pick<CoachSignal, "kind" | "habitId">,
  storage?: CoachCardDismissalStorage,
  now = new Date(),
): Promise<boolean> {
  const store = storage ?? (await defaultStorage());
  if (!store) return false;
  const record = await readRecord(store, localDateKey(now));
  return record.keys.includes(signalDismissalKey(signal));
}

export async function dismissCoachCard(
  signal: Pick<CoachSignal, "kind" | "habitId">,
  storage?: CoachCardDismissalStorage,
  now = new Date(),
): Promise<void> {
  const store = storage ?? (await defaultStorage());
  if (!store) return;
  const record = await readRecord(store, localDateKey(now));
  const key = signalDismissalKey(signal);
  if (!record.keys.includes(key)) record.keys.push(key);
  await store.setItem(DISMISSED_KEY, JSON.stringify(record));
}

async function defaultStorage(): Promise<CoachCardDismissalStorage | undefined> {
  try {
    return await import("../platform/storage");
  } catch {
    return undefined;
  }
}
