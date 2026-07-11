import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DUPLICATE_SIMILARITY_THRESHOLD,
  mergeHabitSettings,
  scoreHabitSimilarity,
} from "../lib/coach/habit-intelligence.ts";
import {
  createHabitMutationQueueStore,
  reconcileHabitMutationQueue,
} from "../lib/data/habit-mutation-queue-store.ts";
import { createHabitMutationWriteCoordinator } from "../lib/data/habit-mutation-write-coordinator.ts";
import { validateHabitInput } from "../lib/habits/input-rules.ts";
import { queuedMergedHabitResult } from "../lib/habits/routine-create.ts";

function createMemoryStore() {
  let raw = null;
  return createHabitMutationQueueStore({
    async getItem() {
      return raw;
    },
    async setItem(_key, value) {
      raw = value;
    },
    async removeItem() {
      raw = null;
    },
  });
}

function actionSourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

test("direct habit writes settle captured fields before a second replay can start", async () => {
  const store = createMemoryStore();
  await store.enqueue({
    id: "stale-offline-edit",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: { name: "Stale offline name" },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });

  const runExclusive = createHabitMutationWriteCoordinator();
  let markDirectStarted;
  const directStarted = new Promise((resolve) => {
    markDirectStarted = resolve;
  });
  let releaseDirect;
  const directReleased = new Promise((resolve) => {
    releaseDirect = resolve;
  });
  const serverState = { name: "Stored name" };

  const directWrite = runExclusive(async () => {
    const boundary = await store.captureSupersessionBoundary("user-1", "habit-1");
    markDirectStarted();
    await directReleased;
    serverState.name = "Confirmed online name";
    await store.settleSuperseded(boundary, { name: serverState.name });
  });
  await directStarted;

  let replaySendCount = 0;
  const secondReplay = runExclusive(() =>
    reconcileHabitMutationQueue({
      store,
      userId: "user-1",
      async send(operation) {
        replaySendCount++;
        Object.assign(serverState, operation.payload);
        return { ok: true };
      },
    }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(replaySendCount, 0, "a second replay must wait for direct settlement");

  releaseDirect();
  await Promise.all([directWrite, secondReplay]);
  assert.equal(replaySendCount, 0, "settled stale fields must never reach the second replay");
  assert.deepEqual(serverState, { name: "Confirmed online name" });

  const actions = readFileSync("lib/data/actions.ts", "utf8");
  const transactions = [
    actionSourceBetween(
      actions,
      "export async function updateHabitReminders",
      "export async function createHabit",
    ),
    actionSourceBetween(
      actions,
      "export async function updateHabitFull",
      "export async function deleteHabit",
    ),
    actionSourceBetween(
      actions,
      "export async function deleteHabit",
      "export async function updatePassword",
    ),
  ];
  for (const transaction of transactions) {
    const coordinator = transaction.indexOf("runHabitMutationWriteExclusive");
    const stage = transaction.indexOf("enqueueHabitMutation", coordinator);
    const serverWrite = transaction.indexOf(".update(staged.payload)", stage);
    const settlement = transaction.indexOf("settleConfirmedQueuedMutation", serverWrite);
    assert.ok(coordinator >= 0, "direct write must acquire the shared coordinator");
    assert.ok(stage > coordinator, "durable staging must occur inside the coordinator");
    assert.ok(serverWrite > stage, "server write must follow durable staging");
    assert.ok(settlement > serverWrite, "journal settlement must remain inside the coordinator");
  }
});

test("duplicate merge re-fetches the owned row after an older replay commits", async () => {
  const store = createMemoryStore();
  await store.enqueue({
    id: "raise-target-offline",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: { target: 3000 },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });

  const serverHabit = {
    id: "habit-1",
    user_id: "user-1",
    name: "Drink water",
    description: null,
    icon: "water_drop",
    target: 1000,
    unit: "ml",
    reminder_times: [],
    reminder_days: [0, 1, 2, 3, 4, 5, 6],
    reminders_enabled: false,
    habit_type: "water_intake",
    metric_type: "volume_ml",
    visual_type: "water_bottle",
    reminder_strategy: "manual",
    reminder_interval_minutes: null,
    default_log_value: 250,
  };
  const candidate = {
    name: "Drink more water",
    description: null,
    icon: "water_drop",
    unit: "ml",
    target: 2000,
    habitType: "water_intake",
    metricType: "volume_ml",
    visualType: "water_bottle",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 500,
  };

  const runExclusive = createHabitMutationWriteCoordinator();
  let markReplayStarted;
  const replayStarted = new Promise((resolve) => {
    markReplayStarted = resolve;
  });
  let releaseReplay;
  const replayReleased = new Promise((resolve) => {
    releaseReplay = resolve;
  });

  const replay = runExclusive(() =>
    reconcileHabitMutationQueue({
      store,
      userId: "user-1",
      async send(operation) {
        markReplayStarted();
        await replayReleased;
        Object.assign(serverHabit, operation.payload);
        return { ok: true };
      },
    }),
  );
  await replayStarted;

  const merge = runExclusive(async () => {
    const authoritativeHabit = { ...serverHabit };
    const merged = mergeHabitSettings(candidate, authoritativeHabit);
    Object.assign(serverHabit, merged);
  });
  releaseReplay();
  await Promise.all([replay, merge]);
  assert.equal(serverHabit.target, 3000, "merge must retain the stronger replayed target");

  const actions = readFileSync("lib/data/actions.ts", "utf8");
  const mergeSource = actionSourceBetween(
    actions,
    "return runHabitMutationWriteExclusive(async (): Promise<HabitCreateResult> => {",
    "export async function updateHabitFull",
  );
  const coordinator = mergeSource.indexOf("runHabitMutationWriteExclusive");
  const authoritativeRead = mergeSource.indexOf('.from("habits")', coordinator);
  const pendingRead = mergeSource.indexOf("listPendingHabitMutations", coordinator);
  const authoritativeScore = mergeSource.indexOf("scoreHabitSimilarity(candidate, habit)");
  const thresholdCheck = mergeSource.indexOf(
    "match.score < DUPLICATE_SIMILARITY_THRESHOLD",
    authoritativeScore,
  );
  const mergeSettings = mergeSource.indexOf("mergeHabitSettings(candidate, match.habit)");
  assert.ok(authoritativeRead > coordinator, "owned duplicate row must be read inside coordinator");
  assert.ok(pendingRead > coordinator, "pending edits must be read inside coordinator");
  assert.ok(
    authoritativeScore > authoritativeRead,
    "duplicate score must use refreshed effective rows",
  );
  assert.ok(thresholdCheck > authoritativeScore, "a renamed row must no longer be merged");
  assert.ok(mergeSettings > authoritativeRead, "merge settings must use the authoritative row");
});

test("journal-first direct writes remain idempotent when success settlement storage fails", async () => {
  let raw = null;
  let rejectWrites = false;
  const store = createHabitMutationQueueStore({
    async getItem() {
      return raw;
    },
    async setItem(_key, value) {
      if (rejectWrites) throw new Error("storage unavailable");
      raw = value;
    },
    async removeItem() {
      if (rejectWrites) throw new Error("storage unavailable");
      raw = null;
    },
  });
  await store.enqueue({
    id: "older-offline-edit",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: { name: "Stale name", reminders_enabled: false },
    queuedAt: "2026-07-11T09:00:00.000Z",
  });
  const staged = await store.enqueue({
    id: "new-direct-write",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: { name: "Confirmed name" },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });
  assert.equal(staged?.id, "new-direct-write", "enqueue must return the durable compacted write");

  const serverState = { name: "Stored name", reminders_enabled: true };
  Object.assign(serverState, staged.payload);
  rejectWrites = true;
  await assert.rejects(store.settleSucceeded(staged.id), /storage unavailable/);
  rejectWrites = false;

  await reconcileHabitMutationQueue({
    store,
    userId: "user-1",
    async send(operation) {
      Object.assign(serverState, operation.payload);
      return { ok: true };
    },
  });
  assert.deepEqual(serverState, { name: "Confirmed name", reminders_enabled: false });
  assert.deepEqual(await store.read(), []);
});

test("idle pending fields participate in authoritative duplicate ranking and merge", async () => {
  const store = createMemoryStore();
  await store.enqueue({
    id: "idle-offline-edit",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: {
      name: "Drink water",
      icon: "water_drop",
      target: 3000,
      unit: "ml",
      habit_type: "water_intake",
      metric_type: "volume_ml",
      visual_type: "water_bottle",
      default_log_value: 500,
    },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });
  const storedHabit = {
    id: "habit-1",
    user_id: "user-1",
    name: "Journal",
    description: null,
    icon: "edit_note",
    target: null,
    unit: null,
    reminder_times: [],
    reminder_days: [0, 1, 2, 3, 4, 5, 6],
    reminders_enabled: false,
    habit_type: "custom",
    metric_type: "boolean",
    visual_type: "progress_ring",
    reminder_strategy: "manual",
    reminder_interval_minutes: null,
    default_log_value: null,
  };
  const candidate = {
    name: "Drink more water",
    description: null,
    icon: "water_drop",
    unit: "ml",
    target: 2000,
    habitType: "water_intake",
    metricType: "volume_ml",
    visualType: "water_bottle",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 500,
  };
  assert.ok(scoreHabitSimilarity(candidate, storedHabit) < DUPLICATE_SIMILARITY_THRESHOLD);

  const [pending] = await store.read();
  const effectiveHabit = { ...storedHabit, ...pending.payload };
  assert.ok(scoreHabitSimilarity(candidate, effectiveHabit) >= DUPLICATE_SIMILARITY_THRESHOLD);
  const merged = mergeHabitSettings(candidate, effectiveHabit);
  const staged = await store.enqueue({
    id: "direct-merge",
    kind: "update",
    habitId: effectiveHabit.id,
    userId: effectiveHabit.user_id,
    payload: merged,
    queuedAt: "2026-07-11T10:01:00.000Z",
  });
  Object.assign(storedHabit, staged.payload);
  await store.settleSucceeded(staged.id);

  assert.equal(storedHabit.target, 3000);
  assert.deepEqual(await store.read(), []);

  const actions = readFileSync("lib/data/actions.ts", "utf8");
  const createStart = actions.indexOf("async function createHabitForUserUnsafe");
  const updateStart = actions.indexOf("export async function updateHabitFull", createStart);
  const createSource = actions.slice(createStart, updateStart);
  const coordinator = createSource.indexOf("runHabitMutationWriteExclusive");
  const authoritativeRows = createSource.indexOf('.from("habits")', coordinator);
  const pendingRead = createSource.indexOf("listPendingHabitMutations", coordinator);
  const ranking = createSource.indexOf("scoreHabitSimilarity", coordinator);
  const mergeWrite = createSource.indexOf(".update(staged.payload)", coordinator);
  const insertDecision = createSource.indexOf("return insertNewHabit()", ranking);
  assert.ok(coordinator >= 0, "merge-or-insert decision must acquire the write coordinator");
  assert.ok(
    authoritativeRows > coordinator,
    "active rows must be refreshed inside the coordinator",
  );
  assert.ok(pendingRead > coordinator, "idle pending fields must be read inside the coordinator");
  assert.ok(
    ranking > authoritativeRows && ranking > pendingRead,
    "ranking must use effective rows",
  );
  assert.ok(mergeWrite > ranking, "merged writes must send the exact staged payload");
  assert.ok(insertDecision > ranking, "no-match insertion must remain inside the same coordinator");
});

test("production direct updates durably stage the exact payload before sending", () => {
  const actions = readFileSync("lib/data/actions.ts", "utf8");
  for (const [startMarker, endMarker] of [
    ["export async function updateHabitReminders", "export async function createHabit"],
    ["export async function updateHabitFull", "export async function deleteHabit"],
    ["export async function deleteHabit", "export async function updatePassword"],
  ]) {
    const source = actionSourceBetween(actions, startMarker, endMarker);
    const stage = source.indexOf("await enqueueHabitMutation");
    const send = source.indexOf(".update(staged.payload)", stage);
    const settle = source.indexOf("settleConfirmedQueuedMutation", send);
    assert.ok(stage >= 0, `${startMarker} must durably stage before writing`);
    assert.ok(send > stage, `${startMarker} must send the staged payload`);
    assert.ok(settle > send, `${startMarker} must settle only after server success`);
  }
});

test("retryable duplicate merges remain successful while their durable write is queued", () => {
  const optimisticHabit = {
    id: "habit-1",
    user_id: "user-1",
    name: "Drink water",
  };
  const result = queuedMergedHabitResult(optimisticHabit);
  assert.deepEqual(result, {
    ok: true,
    id: "habit-1",
    habit: optimisticHabit,
    merged: true,
    queued: true,
  });

  const actions = readFileSync("lib/data/actions.ts", "utf8");
  const createSource = actionSourceBetween(
    actions,
    "async function createHabitForUserUnsafe",
    "export async function updateHabitFull",
  );
  const firstRetryable = createSource.indexOf("isRetryableHabitMutationError(error)");
  const firstQueuedSuccess = createSource.indexOf("return queuedMergeSuccess", firstRetryable);
  const legacyRetryable = createSource.indexOf(
    "isRetryableHabitMutationError(legacyError)",
    firstRetryable + 1,
  );
  const legacyQueuedSuccess = createSource.indexOf("return queuedMergeSuccess", legacyRetryable);
  assert.ok(firstRetryable >= 0 && firstQueuedSuccess > firstRetryable);
  assert.ok(legacyRetryable >= 0 && legacyQueuedSuccess > legacyRetryable);
});

test("opt-out creation rejects an exact name introduced by an idle queued rename", async () => {
  const store = createMemoryStore();
  await store.enqueue({
    id: "rename-offline",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: { name: "Read" },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });
  const storedHabit = {
    id: "habit-1",
    user_id: "user-1",
    name: "Journal",
    archived_at: null,
  };
  const [pending] = await store.read();
  const effectiveHabit = { ...storedHabit, ...pending.payload };
  const validation = validateHabitInput({
    name: " Read ",
    metricType: "minutes",
    target: 10,
    existingHabits: [effectiveHabit],
    currentHabitId: null,
  });
  assert.equal(validation.ok, false);
  assert.deepEqual(validation.errors, ["A habit with this name already exists."]);

  const actions = readFileSync("lib/data/actions.ts", "utf8");
  const createSource = actionSourceBetween(
    actions,
    "async function createHabitForUserUnsafe",
    "export async function updateHabitFull",
  );
  const coordinator = createSource.indexOf("runHabitMutationWriteExclusive");
  const effectiveRows = createSource.indexOf("const effectiveHabits", coordinator);
  const mergeOptOut = createSource.indexOf("if (data.mergeSimilar === false)", coordinator);
  const authoritativeValidation = createSource.indexOf("validateHabitInput", mergeOptOut);
  const effectiveValidation = createSource.indexOf("existingHabits: effectiveHabits", mergeOptOut);
  const insert = createSource.indexOf("return insertNewHabit()", mergeOptOut);
  assert.ok(coordinator >= 0);
  assert.ok(effectiveRows > coordinator);
  assert.ok(mergeOptOut > effectiveRows, "merge opt-out must use refreshed effective rows");
  assert.ok(authoritativeValidation > mergeOptOut);
  assert.ok(effectiveValidation > authoritativeValidation);
  assert.ok(insert > effectiveValidation, "validated insertion must remain inside the coordinator");
});
