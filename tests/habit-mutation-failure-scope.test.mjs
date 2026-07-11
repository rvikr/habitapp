import assert from "node:assert/strict";
import test from "node:test";

import {
  createHabitMutationQueueStore,
  HABIT_MUTATION_JOURNAL_STORAGE_KEY,
} from "../lib/data/habit-mutation-queue-store.ts";

function memoryStore() {
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

function operation(id, payload, kind = "update") {
  return {
    id,
    kind,
    habitId: "habit-1",
    userId: "user-1",
    payload,
    queuedAt: "2026-07-11T10:00:00.000Z",
  };
}

test("a successful partial replay clears only matching rejected fields", async () => {
  const store = memoryStore();
  await store.enqueue(
    operation("failed-full-edit", {
      name: "Offline name",
      reminders_enabled: false,
      reminder_times: ["08:00"],
    }),
  );
  await store.settleRejected("failed-full-edit", {
    reason: "rejected",
    failedAt: "2026-07-11T10:01:00.000Z",
  });

  await store.enqueue(
    operation("saved-reminders", {
      reminders_enabled: true,
      reminder_times: ["09:00"],
    }),
  );
  await store.settleSucceeded("saved-reminders");

  const [remainingFailure] = await store.readFailures("user-1", "habit-1");
  assert.ok(remainingFailure, "the rejected name edit must remain visible");
  assert.deepEqual(remainingFailure.failedFields, ["name"]);

  await store.enqueue(operation("saved-name", { name: "Online name" }));
  await store.settleSucceeded("saved-name");
  assert.deepEqual(await store.readFailures("user-1", "habit-1"), []);
});

test("a successful queued archive makes prior field failures irrelevant", async () => {
  const store = memoryStore();
  await store.enqueue(operation("failed-name", { name: "Offline name" }));
  await store.settleRejected("failed-name", {
    reason: "rejected",
    failedAt: "2026-07-11T10:01:00.000Z",
  });
  await store.enqueue(
    operation(
      "saved-archive",
      { archived_at: "2026-07-11T10:02:00.000Z", reminders_enabled: false },
      "archive",
    ),
  );
  await store.settleSucceeded("saved-archive");
  assert.deepEqual(await store.readFailures("user-1", "habit-1"), []);
});

test("legacy failures without field provenance are kept after a partial replay", async () => {
  const pending = operation("saved-reminders", { reminders_enabled: true });
  let raw = JSON.stringify({
    version: 1,
    pending: [pending],
    failures: [
      {
        id: "legacy-failure",
        operationId: "legacy-failure",
        kind: "update",
        habitId: "habit-1",
        userId: "user-1",
        reason: "rejected",
        code: "42501",
        queuedAt: "2026-07-10T10:00:00.000Z",
        failedAt: "2026-07-10T10:01:00.000Z",
      },
    ],
  });
  const store = createHabitMutationQueueStore({
    async getItem(key) {
      return key === HABIT_MUTATION_JOURNAL_STORAGE_KEY ? raw : null;
    },
    async setItem(_key, value) {
      raw = value;
    },
    async removeItem() {
      raw = null;
    },
  });

  await store.settleSucceeded("saved-reminders");
  const [failure] = await store.readFailures("user-1", "habit-1");
  assert.equal(failure?.operationId, "legacy-failure");
  assert.equal(failure?.failedFields, null);

  await store.enqueue(operation("saved-full", { name: "Saved", reminders_enabled: true }));
  await store.settleSucceeded("saved-full", { resolveLegacyFailures: true });
  assert.deepEqual(await store.readFailures("user-1", "habit-1"), []);
});
