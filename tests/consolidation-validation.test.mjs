import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("native suggested and widget check-ins pass validated habit metadata to the action boundary", () => {
  const dashboard = readFileSync("app/(tabs)/index.tsx", "utf8");
  const widget = readFileSync("app/widget/check-in.tsx", "utf8");

  const primaryCheckIn =
    dashboard.match(
      /async function handleToggle[\s\S]*?async function handleLogSheetSubmit/,
    )?.[0] ?? "";
  assert.match(
    primaryCheckIn,
    /logCompletionOnce\([\s\S]*?suggestion\.value,[\s\S]*?undefined,[\s\S]*?habit[\s\S]*?\)/,
  );
  assert.match(
    widget,
    /logCompletionOnce\([\s\S]*?checkIn\.amount,[\s\S]*?undefined,[\s\S]*?validated\.habit[\s\S]*?\)/,
  );
});
