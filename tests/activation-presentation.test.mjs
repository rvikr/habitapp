import assert from "node:assert/strict";
import test from "node:test";

let presentation;
try {
  presentation = await import("../lib/activation/presentation.ts");
} catch {
  presentation = null;
}

test("activation presentation helper is available", () => {
  assert.ok(presentation, "expected the activation presentation policy module");
});

test("control keeps every tab and current dashboard surface without replaying achieved onboarding", () => {
  for (const stage of ["pre_value", "first_log", "engaged"]) {
    const policy = presentation.resolveActivationPresentation("control", stage);
    assert.deepEqual(policy.visibleTabs, [
      "index",
      "achievements",
      "progress",
      "leaderboard",
      "settings",
    ]);
    assert.equal(policy.notificationMode, "standard");
    assert.equal(policy.showMonetization, true);
    assert.equal(policy.showCompetition, true);
    assert.equal(policy.showCoach, true);
    assert.equal(policy.hideDuplicateEmptyHeaderAction, false);
    assert.equal(policy.allowFirstRunOnboarding, stage === "pre_value");
  }
});

test("pre-value treatment exposes only Today and Settings", () => {
  const policy = presentation.resolveActivationPresentation("activation_v2", "pre_value");
  assert.deepEqual(policy.visibleTabs, ["index", "settings"]);
  assert.equal(policy.notificationMode, "hidden");
  assert.equal(policy.showMonetization, false);
  assert.equal(policy.showCompetition, false);
  assert.equal(policy.showCoach, false);
  assert.equal(policy.hideDuplicateEmptyHeaderAction, true);
  assert.equal(policy.allowFirstRunOnboarding, true);
});

test("first-log treatment adds Badges and Progress but keeps promotion and ranks gated", () => {
  const policy = presentation.resolveActivationPresentation("activation_v2", "first_log");
  assert.deepEqual(policy.visibleTabs, ["index", "achievements", "progress", "settings"]);
  assert.equal(policy.notificationMode, "contextual");
  assert.equal(policy.showMonetization, false);
  assert.equal(policy.showCompetition, false);
  assert.equal(policy.showCoach, false);
  assert.equal(policy.hideDuplicateEmptyHeaderAction, false);
  assert.equal(policy.allowFirstRunOnboarding, false);
});

test("engaged treatment restores the current interface without relaunching onboarding", () => {
  const policy = presentation.resolveActivationPresentation("activation_v2", "engaged");
  assert.deepEqual(policy.visibleTabs, [
    "index",
    "achievements",
    "progress",
    "leaderboard",
    "settings",
  ]);
  assert.equal(policy.notificationMode, "standard");
  assert.equal(policy.showMonetization, true);
  assert.equal(policy.showCompetition, true);
  assert.equal(policy.showCoach, true);
  assert.equal(policy.allowFirstRunOnboarding, false);
});

test("tab route guard redirects only hidden treatment tab roots", () => {
  assert.equal(
    presentation.isActivationTabPathAllowed(
      "/achievements",
      presentation.resolveActivationPresentation("activation_v2", "pre_value"),
    ),
    false,
  );
  assert.equal(
    presentation.isActivationTabPathAllowed(
      "/progress/details",
      presentation.resolveActivationPresentation("activation_v2", "pre_value"),
    ),
    false,
  );
  assert.equal(
    presentation.isActivationTabPathAllowed(
      "/leaderboard",
      presentation.resolveActivationPresentation("activation_v2", "first_log"),
    ),
    false,
  );
  assert.equal(
    presentation.isActivationTabPathAllowed(
      "/progress",
      presentation.resolveActivationPresentation("activation_v2", "first_log"),
    ),
    true,
  );
  assert.equal(
    presentation.isActivationTabPathAllowed(
      "/leaderboard",
      presentation.resolveActivationPresentation("control", "pre_value"),
    ),
    true,
  );
  assert.equal(
    presentation.isActivationTabPathAllowed(
      "/pro",
      presentation.resolveActivationPresentation("activation_v2", "pre_value"),
    ),
    true,
  );
});
