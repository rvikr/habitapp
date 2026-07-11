import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  assertActivationAnalyticsSafe,
  installAnalyticsCollector,
  requireAnalyticsEvent,
} = require("../scripts/first-run/analytics-events.cjs");

test("browser analytics collector reads dev track events and rejects private properties", async () => {
  const page = new EventEmitter();
  const collector = installAnalyticsCollector(page);
  const arg = (value) => ({ jsonValue: async () => value });
  page.emit("console", {
    args: () => [
      arg("[track]"),
      arg("routine_created"),
      arg({
        activation_variant: "control",
        activation_bucket: 12,
        rollout_percentage: 50,
        activation_stage: "first_log",
        platform: "web",
        created_count: 2,
      }),
    ],
  });
  await collector.settle();
  const event = requireAnalyticsEvent(collector.events, "routine_created");
  assert.equal(event.properties.created_count, 2);
  assert.doesNotThrow(() => assertActivationAnalyticsSafe(event));
  assert.throws(
    () => assertActivationAnalyticsSafe({ name: "bad", properties: { habit_id: "secret" } }),
    /private analytics property/i,
  );
  assert.throws(
    () =>
      assertActivationAnalyticsSafe({
        name: "bad",
        properties: { safe_key: "private@example.com" },
      }),
    /private analytics value/i,
  );
});
