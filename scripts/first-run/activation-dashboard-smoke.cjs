const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");
const {
  assertActivationAnalyticsSafe,
  installAnalyticsCollector,
  requireAnalyticsEvent,
} = require("./analytics-events.cjs");

const BASE_URL = "http://localhost:8083";
const STORAGE_KEY = "sb-ehcqgoymkmljwoveisbl-auth-token";

function fakeSession(sequence) {
  const suffix = String(sequence).padStart(12, "0");
  const userId = `00000000-0000-4000-8000-${suffix}`;
  const email = `activation-stage-${sequence}@example.invalid`;
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: `fake-access-token-${sequence}`,
    refresh_token: `fake-refresh-token-${sequence}`,
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: "bearer",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email,
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: [
        {
          id: userId,
          user_id: userId,
          provider: "email",
          identity_data: { email, sub: userId },
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

function milestonesFor(stage) {
  if (stage === "engaged") {
    return {
      first_habit_logged_at: "2026-07-01T10:00:00.000Z",
      activation_engaged_at: "2026-07-02T10:00:00.000Z",
    };
  }
  if (stage === "first_log") {
    return {
      first_habit_logged_at: "2026-07-01T10:00:00.000Z",
      activation_engaged_at: null,
    };
  }
  return { first_habit_logged_at: null, activation_engaged_at: null };
}

async function installBackend(page, { treatment, stage, sequence, onboardingStored }) {
  const analyticsCollector = installAnalyticsCollector(page);
  const session = fakeSession(sequence);
  const onboardingKey = `habbit:onboarding-complete:${session.user.id}`;
  const unexpectedRequests = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.stack || error.message || error)));

  await page.addInitScript(
    ({ storageKey, onboardingKey, onboardingStored, session }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(session));
      if (onboardingStored) localStorage.setItem(onboardingKey, "1");
      if (typeof Notification !== "undefined") {
        Object.defineProperty(Notification, "permission", {
          configurable: true,
          get: () => "default",
        });
      }
    },
    { storageKey: STORAGE_KEY, onboardingKey, onboardingStored, session },
  );

  await page.route("**/*.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const headers = {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "content-range": "0-0/0",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path.includes("/auth/v1/user")) {
      return route.fulfill({ status: 200, headers, body: JSON.stringify(session.user) });
    }
    if (path.includes("/functions/v1/sync-subscription")) {
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) });
    }
    if (path.includes("/functions/v1/leaderboard")) {
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ entries: [], position: null }),
      });
    }
    if (path.includes("/rest/v1/feature_flags")) {
      const activationFlag = request.url().includes("activation_v2");
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          enabled: activationFlag && treatment,
          rollout_percentage: activationFlag && treatment ? 100 : 0,
        }),
      });
    }
    if (path.includes("/rest/v1/profiles")) {
      const trialEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          user_id: session.user.id,
          display_name: null,
          avatar_style: null,
          avatar_seed: null,
          coach_tone: "friendly",
          is_pro: false,
          pro_trial_ends_at: trialEnd,
          revenuecat_entitlement_active: false,
          pro_expires_at: null,
          ...milestonesFor(stage),
        }),
      });
    }
    if (path.includes("/rest/v1/rpc/get_completion_dates")) {
      return route.fulfill({ status: 200, headers, body: "[]" });
    }
    if (path.includes("/rest/v1/habits") || path.includes("/rest/v1/habit_completions")) {
      return route.fulfill({
        status: 200,
        headers,
        body: request.method() === "HEAD" ? "" : "[]",
      });
    }

    unexpectedRequests.push({ method: request.method(), url: request.url() });
    return route.fulfill({
      status: 200,
      headers,
      body: request.method() === "HEAD" ? "" : "[]",
    });
  });

  return { session, onboardingKey, unexpectedRequests, pageErrors, analyticsCollector };
}

async function expectActivationAnalytics(harness, { variant, stage, rolloutPercentage }) {
  await harness.analyticsCollector.settle();
  for (const name of ["activation_exposed", "activation_entry"]) {
    const matching = harness.analyticsCollector.events.filter(
      (event) =>
        event.name === name &&
        event.properties.activation_variant === variant &&
        event.properties.activation_stage === stage &&
        event.properties.rollout_percentage === rolloutPercentage &&
        typeof event.properties.activation_bucket === "number",
    );
    assert.equal(matching.length, 1, `${name} must be emitted once for ${variant}/${stage}`);
    assertActivationAnalyticsSafe(matching[0]);
  }
}

async function expectText(page, text, visible) {
  const locator = page.getByText(text, { exact: true });
  if (visible) {
    await locator.first().waitFor({ state: "visible", timeout: 30000 });
    return;
  }
  await page.waitForTimeout(150);
  assert.equal(await locator.count(), 0, `expected ${JSON.stringify(text)} to be hidden`);
}

async function expectButton(page, name, visible) {
  const locator = page.getByRole("button", { name, exact: true });
  if (visible) {
    await locator.first().waitFor({ state: "visible", timeout: 30000 });
    return;
  }
  await page.waitForTimeout(150);
  assert.equal(await locator.count(), 0, `expected button ${JSON.stringify(name)} to be hidden`);
}

async function expectTabs(page, visibleTabs) {
  for (const tab of ["Today", "Badges", "Progress", "Ranks", "Settings"]) {
    await expectText(page, tab, visibleTabs.includes(tab));
  }
}

async function expectDashboardSurfaces(page, mode) {
  const full = mode === "full";
  const firstLog = mode === "first_log";
  const body = page.locator("body");
  if (full) {
    await body
      .getByText(/days? of Pro left/)
      .first()
      .waitFor({ timeout: 30000 });
    await expectText(page, "L1", true);
    await expectButton(page, "AI Coach", true);
    await expectText(page, "Join the global leaderboard", true);
  } else {
    await page.waitForTimeout(150);
    assert.equal(
      await body.getByText(/days? of Pro left/).count(),
      0,
      "trial banner must be hidden",
    );
    await expectText(page, "L1", false);
    await expectButton(page, "AI Coach", false);
    await expectText(page, "Join the global leaderboard", false);
  }
  await expectText(page, "Enable notifications", full || firstLog);
}

async function openDashboard(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  try {
    await page.getByRole("button", { name: "Build my routine" }).waitFor({ timeout: 30000 });
  } catch (error) {
    console.error("dashboard hydration failed", {
      url: page.url(),
      text: await page.locator("body").innerText(),
    });
    await page.screenshot({
      path: "tmp/activation-dashboard-hydration-failure.png",
      fullPage: true,
    });
    throw error;
  }
  await page.getByRole("button", { name: "Choose manually" }).waitFor({ timeout: 30000 });
}

async function runControlPreValue(browser, results) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const harness = await installBackend(page, {
    treatment: false,
    stage: "pre_value",
    sequence: 60,
    onboardingStored: false,
  });
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForURL((url) => url.pathname === "/habits/wizard", { timeout: 30000 });
  await page.getByText("STEP 1 OF 8", { exact: true }).waitFor({ timeout: 30000 });
  await expectActivationAnalytics(harness, {
    variant: "control",
    stage: "pre_value",
    rolloutPercentage: 0,
  });
  results.push({ scenario: "control-pre-value", url: page.url(), ...harness });
  await page.close();
}

async function runControlEngaged(browser, results) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const harness = await installBackend(page, {
    treatment: false,
    stage: "engaged",
    sequence: 61,
    onboardingStored: false,
  });
  await openDashboard(page);
  await expectTabs(page, ["Today", "Badges", "Progress", "Ranks", "Settings"]);
  await expectDashboardSurfaces(page, "full");
  await expectActivationAnalytics(harness, {
    variant: "control",
    stage: "engaged",
    rolloutPercentage: 0,
  });
  await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByText("Leaderboard", { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(new URL(page.url()).pathname, "/leaderboard");
  results.push({ scenario: "control-engaged", url: page.url(), ...harness });
  await page.close();
}

async function runTreatmentPreValue(browser, results) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const harness = await installBackend(page, {
    treatment: true,
    stage: "pre_value",
    sequence: 62,
    onboardingStored: true,
  });
  await openDashboard(page);
  await expectTabs(page, ["Today", "Settings"]);
  await expectDashboardSurfaces(page, "restricted");
  await expectButton(page, "Add habit", false);
  await expectActivationAnalytics(harness, {
    variant: "activation_v2",
    stage: "pre_value",
    rolloutPercentage: 100,
  });

  await page.goto(`${BASE_URL}/achievements`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForURL((url) => url.pathname === "/", { timeout: 30000 });
  await page.getByRole("button", { name: "Build my routine" }).waitFor({ timeout: 30000 });

  await page.goto(`${BASE_URL}/pro`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByText("Lagan Pro", { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(new URL(page.url()).pathname, "/pro", "direct Pro access must remain available");
  results.push({ scenario: "treatment-pre-value", url: page.url(), ...harness });
  await page.close();
}

async function runTreatmentFirstLog(browser, results) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const harness = await installBackend(page, {
    treatment: true,
    stage: "first_log",
    sequence: 63,
    onboardingStored: false,
  });
  await openDashboard(page);
  await expectTabs(page, ["Today", "Badges", "Progress", "Settings"]);
  await expectDashboardSurfaces(page, "first_log");
  await expectActivationAnalytics(harness, {
    variant: "activation_v2",
    stage: "first_log",
    rolloutPercentage: 100,
  });

  await page.evaluate(
    (key) => localStorage.setItem(key, "1"),
    `habbit:first-log-notification-offered:${harness.session.user.id}`,
  );
  await page.getByText("Settings", { exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/settings", { timeout: 30000 });
  await page.getByText("Today", { exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 30000 });
  await page.getByRole("button", { name: "Build my routine" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
  await expectText(page, "Enable notifications", false);

  await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForURL((url) => url.pathname === "/", { timeout: 30000 });
  await harness.analyticsCollector.settle();
  const promptEvents = harness.analyticsCollector.events.filter(
    (event) =>
      event.name === "notification_prompt_shown" &&
      event.properties.surface === "dashboard" &&
      event.properties.activation_stage === "first_log",
  );
  assert.equal(promptEvents.length, 1, "the contextual dashboard prompt must be tracked once");
  assertActivationAnalyticsSafe(
    requireAnalyticsEvent(harness.analyticsCollector.events, "notification_prompt_shown"),
  );
  results.push({ scenario: "treatment-first-log", url: page.url(), ...harness });
  await page.close();
}

async function runTreatmentEngaged(browser, results) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const harness = await installBackend(page, {
    treatment: true,
    stage: "engaged",
    sequence: 64,
    onboardingStored: false,
  });
  await openDashboard(page);
  await expectTabs(page, ["Today", "Badges", "Progress", "Ranks", "Settings"]);
  await expectDashboardSurfaces(page, "full");
  await expectActivationAnalytics(harness, {
    variant: "activation_v2",
    stage: "engaged",
    rolloutPercentage: 100,
  });
  await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByText("Leaderboard", { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(new URL(page.url()).pathname, "/leaderboard");
  results.push({ scenario: "treatment-engaged", url: page.url(), ...harness });
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    await runControlPreValue(browser, results);
    await runControlEngaged(browser, results);
    await runTreatmentPreValue(browser, results);
    await runTreatmentFirstLog(browser, results);
    await runTreatmentEngaged(browser, results);
  } finally {
    await browser.close();
  }

  for (const result of results) {
    assert.deepEqual(result.pageErrors, [], `${result.scenario} emitted browser errors`);
  }
  fs.writeFileSync(
    "tmp/activation-dashboard-smoke-current.json",
    JSON.stringify(
      results.map(({ session, ...result }) => result),
      null,
      2,
    ),
  );
  console.log("activation dashboard stages and route guards passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
