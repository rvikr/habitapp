const { chromium } = require("playwright");
const fs = require("fs");
const {
  captureStableScreenshot,
  prepareScreenshotPage,
} = require("./screenshot-helper.cjs");
const {
  assertActivationAnalyticsSafe,
  installAnalyticsCollector,
  requireAnalyticsEvent,
} = require("./analytics-events.cjs");

function fakeSession() {
  const userId = "00000000-0000-4000-8000-000000000001";
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "treatment-quick-start-access-token",
    refresh_token: "treatment-quick-start-refresh-token",
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: "bearer",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "treatment-quick-start@example.invalid",
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

(async () => {
  const storageKey = "sb-ehcqgoymkmljwoveisbl-auth-token";
  const session = fakeSession();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const page = await context.newPage();
  await prepareScreenshotPage(page);
  const analyticsCollector = installAnalyticsCollector(page);
  const pageErrors = [];
  const unexpectedBackendCalls = [];
  const habitInsertRequests = [];
  let releaseFirstHabitPost;
  const firstHabitPostGate = new Promise((resolve) => {
    releaseFirstHabitPost = resolve;
  });
  page.on("pageerror", (error) => pageErrors.push(String(error.stack || error.message || error)));

  await page.addInitScript(
    ({ storageKey, session }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(session));
    },
    { storageKey, session },
  );

  await page.route("**/*.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const headers = { "content-type": "application/json", "access-control-allow-origin": "*" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path.includes("/auth/v1/user")) {
      return route.fulfill({ status: 200, headers, body: JSON.stringify(session.user) });
    }
    if (path.includes("/functions/v1/sync-subscription")) {
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) });
    }
    if (path.includes("/functions/v1/validate-habit")) {
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ status: "ok" }) });
    }
    if (path.includes("/rest/v1/feature_flags")) {
      const activation = request.url().includes("activation_v2");
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          enabled: activation,
          rollout_percentage: activation ? 100 : 0,
        }),
      });
    }
    if (path.endsWith("/rest/v1/rpc/set_profile_time_zone")) {
      return route.fulfill({ status: 200, headers, body: JSON.stringify("UTC") });
    }
    if (path.includes("/rest/v1/profiles")) {
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          first_habit_logged_at: null,
          activation_engaged_at: null,
          display_name: null,
          coach_tone: "friendly",
          is_pro: false,
          pro_trial_ends_at: null,
          revenuecat_entitlement_active: false,
          pro_expires_at: null,
        }),
      });
    }
    if (path.includes("/rest/v1/habits")) {
      if (request.method() === "POST") {
        const parsed = JSON.parse(request.postData() || "{}");
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        if (rows.length !== 1) {
          unexpectedBackendCalls.push({
            method: request.method(),
            url: request.url(),
            reason: `expected one inserted habit, received ${rows.length}`,
          });
        }
        const sequence = habitInsertRequests.length + 1;
        const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
        habitInsertRequests.push({ id, payload: rows[0] });
        if (sequence === 1) {
          await firstHabitPostGate;
        }
        return route.fulfill({ status: 201, headers, body: JSON.stringify({ id }) });
      }
      return route.fulfill({
        status: 200,
        headers,
        body: request.method() === "HEAD" ? "" : "[]",
      });
    }
    if (path.includes("/rest/v1/habit_completions")) {
      return route.fulfill({
        status: 200,
        headers,
        body: request.method() === "HEAD" ? "" : "[]",
      });
    }
    if (path.includes("/rest/v1/rpc/get_completion_dates")) {
      return route.fulfill({ status: 200, headers, body: "[]" });
    }
    unexpectedBackendCalls.push({ method: request.method(), url: request.url() });
    return route.fulfill({
      status: 500,
      headers,
      body: JSON.stringify({ message: "unmocked treatment quick-start endpoint", path }),
    });
  });

  await page.goto("http://localhost:8083/habits/wizard", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForURL(/habits\/wizard/, { timeout: 30000 });

  try {
    await page.getByText("STEP 1 OF 3", { exact: true }).waitFor({ timeout: 30000 });
  } catch {
    const initialText = await page.locator("body").innerText({ timeout: 10000 });
    await page.screenshot({ path: "tmp/treatment-quick-start-failure.png", fullPage: true });
    fs.writeFileSync(
      "tmp/treatment-quick-start-smoke-failure.json",
      JSON.stringify(
        { url: page.url(), text: initialText, pageErrors, unexpectedBackendCalls },
        null,
        2,
      ),
    );
    throw new Error(`expected treatment step 1, rendered: ${initialText.slice(0, 800)}`);
  }
  const energy = page.getByRole("button", { name: "Select Energy", exact: true });
  const focus = page.getByRole("button", { name: "Select Focus", exact: true });
  await energy.click();
  await focus.click();
  const energySelected = await energy.getAttribute("aria-selected");
  const focusSelected = await focus.getAttribute("aria-selected");
  if (energySelected !== "false" || focusSelected !== "true") {
    throw new Error(
      `treatment goal selection was not exclusive: energy=${energySelected}, focus=${focusSelected}`,
    );
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByText("Daily context", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Select Office", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByText("Biggest constraint", { exact: true }).waitFor({ timeout: 10000 });
  const personalize = page.getByRole("button", { name: "Personalize targets", exact: true });
  if ((await personalize.getAttribute("aria-expanded")) !== "false") {
    throw new Error("Personalize targets should start collapsed");
  }
  if ((await page.getByText("Age", { exact: true }).count()) !== 0) {
    throw new Error("collapsed personalization rendered its fields");
  }
  await personalize.click();
  if ((await personalize.getAttribute("aria-expanded")) !== "true") {
    throw new Error("Personalize targets did not expose expanded state");
  }
  await page.getByText("Age", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Select Not enough time", exact: true }).click();
  await page.getByRole("button", { name: "Build routine", exact: true }).click();

  await page.getByText("2 habits selected", { exact: true }).waitFor({ timeout: 30000 });
  const collapsedReview = await page.locator("body").innerText();
  if (!collapsedReview.includes("Focus Session") || !collapsedReview.includes("Posture Stretch")) {
    throw new Error("treatment review did not show the first two suggestions");
  }
  for (const hidden of ["Meditate", "Drink Water", "Unlock AI routine refinement"]) {
    if (collapsedReview.includes(hidden)) {
      throw new Error(`treatment review unexpectedly showed ${hidden}`);
    }
  }

  const addSuggestion = page.getByRole("button", {
    name: "Add another suggestion",
    exact: true,
  });
  if ((await addSuggestion.count()) !== 1) {
    throw new Error(
      `missing additional-suggestion disclosure; review rendered: ${collapsedReview}`,
    );
  }
  const addSuggestionHandle = await addSuggestion.elementHandle();
  if (!addSuggestionHandle) throw new Error("additional-suggestion disclosure detached");
  if ((await addSuggestionHandle.getAttribute("aria-expanded")) !== "false") {
    throw new Error("additional suggestions should start collapsed");
  }
  await addSuggestionHandle.click();
  const hideSuggestions = page.getByRole("button", {
    name: "Hide extra suggestions",
    exact: true,
  });
  if ((await hideSuggestions.getAttribute("aria-expanded")) !== "true") {
    throw new Error("additional suggestions did not expose expanded state");
  }
  await page.getByText("Meditate", { exact: true }).waitFor({ timeout: 10000 });

  const createRoutine = page.getByRole("button", { name: "Create routine", exact: true });
  const firstHabitPost = page.waitForRequest(
    (request) =>
      request.method() === "POST" && new URL(request.url()).pathname.includes("/rest/v1/habits"),
    { timeout: 10000 },
  );
  await createRoutine.evaluate((button) => {
    button.click();
    button.click();
  });
  await firstHabitPost;
  try {
    const creatingRoutine = page.getByRole("button", {
      name: "Creating routine...",
      exact: true,
    });
    await creatingRoutine.waitFor({ timeout: 10000 });
    if (!(await creatingRoutine.isDisabled())) {
      throw new Error("Create routine did not become disabled while the batch was in flight");
    }
  } finally {
    releaseFirstHabitPost();
  }

  await page.getByText("Your routine is ready", { exact: true }).waitFor({ timeout: 30000 });
  await page.getByText("2 habits, ready to go.", { exact: true }).waitFor({ timeout: 10000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 });
  const insertedNames = habitInsertRequests.map(({ payload }) => payload?.name);
  if (
    habitInsertRequests.length !== 2 ||
    insertedNames[0] !== "Focus Session" ||
    insertedNames[1] !== "Posture Stretch"
  ) {
    throw new Error(
      `expected one two-habit creation batch, received ${JSON.stringify(insertedNames)}`,
    );
  }

  await analyticsCollector.settle();
  requireAnalyticsEvent(
    analyticsCollector.events,
    "routine_started",
    (event) => event.properties.flow === "quick_start" && event.properties.step_count === 3,
  );
  const completedSteps = analyticsCollector.events.filter(
    (event) => event.name === "routine_step_completed",
  );
  if (completedSteps.length !== 3) {
    throw new Error(`expected three routine step events, got ${completedSteps.length}`);
  }
  requireAnalyticsEvent(
    analyticsCollector.events,
    "routine_created",
    (event) =>
      event.properties.flow === "quick_start" &&
      event.properties.requested_count === 2 &&
      event.properties.created_count === 2 &&
      event.properties.failed_count === 0,
  );
  for (const event of analyticsCollector.events.filter((candidate) =>
    candidate.name.startsWith("routine_"),
  )) {
    assertActivationAnalyticsSafe(event);
    if (event.properties.activation_variant !== "activation_v2") {
      throw new Error(`treatment routine event lost its cohort: ${JSON.stringify(event)}`);
    }
  }

  const text = await page.locator("body").innerText();
  await captureStableScreenshot(page, {
    finalUrl: page.url(),
    target: page.getByText("Your routine is ready", { exact: true }),
    screenshot: { path: "tmp/treatment-quick-start-complete.png", fullPage: true },
  });
  fs.writeFileSync(
    "tmp/treatment-quick-start-smoke-current.json",
    JSON.stringify({ url: page.url(), text, pageErrors, unexpectedBackendCalls }, null, 2),
  );
  await browser.close();

  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join("\n")}`);
  if (unexpectedBackendCalls.length) {
    throw new Error(`unexpected backend calls: ${JSON.stringify(unexpectedBackendCalls)}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
