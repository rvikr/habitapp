const { chromium } = require("playwright");
const fs = require("fs");
const {
  captureStableScreenshot,
  prepareScreenshotPage,
} = require("./screenshot-helper.cjs");

function fakeSession() {
  const userId = "00000000-0000-4000-8000-000000000005";
  const now = Math.floor(Date.now() / 1000);
  const email = "treatment-manual-smoke@example.invalid";
  return {
    access_token: "treatment-manual-access-token",
    refresh_token: "treatment-manual-refresh-token",
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
        { id: userId, user_id: userId, provider: "email", identity_data: { email, sub: userId } },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

(async () => {
  const session = fakeSession();
  const storageKey = "sb-ehcqgoymkmljwoveisbl-auth-token";
  const notificationMarker = `habbit:first-log-notification-offered:${session.user.id}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const page = await context.newPage();
  await prepareScreenshotPage(page);
  const pageErrors = [];
  const unexpectedBackendCalls = [];
  const snapshots = [];
  const today = localDateKey();
  let insertCount = 0;
  let completionRpcCount = 0;
  let submittedPayload = null;
  let authoritativeHabit = null;
  let completionValue = null;
  let releaseCreate;
  let releaseCompletion;
  const createGate = new Promise((resolve) => {
    releaseCreate = resolve;
  });
  const completionGate = new Promise((resolve) => {
    releaseCompletion = resolve;
  });

  page.on("pageerror", (error) => pageErrors.push(String(error.stack || error.message || error)));
  await page.addInitScript(
    ({ storageKey, session }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(session));
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: { permission: "default" },
      });
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
      const isActivationFlag = request.url().includes("activation_v2");
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          enabled: isActivationFlag,
          rollout_percentage: isActivationFlag ? 100 : 0,
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
    if (path.includes("/rest/v1/rpc/get_completion_dates")) {
      return route.fulfill({
        status: 200,
        headers,
        body: completionValue == null ? "[]" : JSON.stringify([today]),
      });
    }
    if (path.includes("/rest/v1/rpc/get_completion_stats")) {
      const credited =
        completionValue != null &&
        authoritativeHabit != null &&
        completionValue >= Number(authoritativeHabit.target ?? 0);
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify([
          {
            total_completions: credited ? 1 : 0,
            completion_dates: credited ? [today] : [],
          },
        ]),
      });
    }
    if (path.includes("/rest/v1/rpc/log_habit_completion")) {
      completionRpcCount += 1;
      const payload = JSON.parse(request.postData() || "{}");
      if (
        payload.p_habit_id !== authoritativeHabit?.id ||
        payload.p_completed_on !== today ||
        payload.p_increment !== 20
      ) {
        return route.fulfill({
          status: 400,
          headers,
          body: JSON.stringify({ message: "unexpected first-log payload" }),
        });
      }
      await completionGate;
      completionValue = Number(completionValue ?? 0) + payload.p_increment;
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) });
    }
    if (path.includes("/rest/v1/habit_completions")) {
      const rows =
        completionValue == null || !authoritativeHabit
          ? []
          : [
              {
                id: "treatment-manual-completion",
                habit_id: authoritativeHabit.id,
                user_id: session.user.id,
                completed_on: today,
                created_at: new Date().toISOString(),
                value: completionValue,
                note: null,
              },
            ];
      return route.fulfill({
        status: 200,
        headers,
        body: request.method() === "HEAD" ? "" : JSON.stringify(rows),
      });
    }
    if (path.includes("/rest/v1/habits")) {
      if (request.method() === "POST") {
        insertCount += 1;
        const raw = JSON.parse(request.postData() || "{}");
        submittedPayload = Array.isArray(raw) ? raw[0] : raw;
        authoritativeHabit = {
          id: "treatment-manual-authoritative",
          user_id: session.user.id,
          name: "Saved Drink Water",
          description: submittedPayload.description || "",
          icon: submittedPayload.icon || "water_drop",
          color: submittedPayload.color || "secondary",
          unit: "ml",
          target: 80,
          reminder_time: null,
          reminder_times: submittedPayload.reminder_times || [],
          reminder_days: submittedPayload.reminder_days || [0, 1, 2, 3, 4, 5, 6],
          reminders_enabled: submittedPayload.reminders_enabled ?? true,
          habit_type: "water_intake",
          metric_type: "volume_ml",
          visual_type: "water_bottle",
          reminder_strategy: "interval",
          reminder_interval_minutes: 120,
          default_log_value: 20,
          archived_at: null,
          created_at: new Date().toISOString(),
        };
        await createGate;
        return route.fulfill({
          status: 201,
          headers,
          body: JSON.stringify(authoritativeHabit),
        });
      }
      if (request.method() === "GET" || request.method() === "HEAD") {
        if (request.method() === "HEAD") return route.fulfill({ status: 200, headers, body: "" });
        const idFilter = url.searchParams.get("id");
        const body = idFilter?.startsWith("eq.")
          ? authoritativeHabit
          : authoritativeHabit
            ? [authoritativeHabit]
            : [];
        return route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
      }
    }
    unexpectedBackendCalls.push({ method: request.method(), url: request.url() });
    return route.fulfill({
      status: 500,
      headers,
      body: JSON.stringify({ message: "unmocked treatment manual endpoint", path }),
    });
  });

  async function snap(label) {
    const text = await page.locator("body").innerText({ timeout: 10000 });
    await captureStableScreenshot(page, {
      finalUrl: page.url(),
      target: "body",
      screenshot: { path: `tmp/treatment-manual-${label}.png`, fullPage: true },
    });
    snapshots.push({ label, url: page.url(), text: text.slice(0, 3000) });
    return text;
  }

  await page.goto("http://localhost:8083/habits/new", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  try {
    await page
      .getByRole("button", { name: "Choose template: Drink Water", exact: true })
      .waitFor({ timeout: 30000 });
  } catch (error) {
    const text = await page.locator("body").innerText({ timeout: 10000 });
    await page.screenshot({ path: "tmp/treatment-manual-initial-failure.png", fullPage: true });
    fs.writeFileSync(
      "tmp/treatment-manual-initial-failure.json",
      JSON.stringify({ url: page.url(), text, pageErrors, unexpectedBackendCalls }, null, 2),
    );
    throw error;
  }
  await page.getByRole("button", { name: "Choose template: Drink Water", exact: true }).click();
  await page.locator('input[value="Drink Water"]').waitFor({ timeout: 10000 });

  const advanced = page.getByRole("button", {
    name: "Show advanced habit options",
    exact: true,
  });
  const initialAdvancedState = await advanced.getAttribute("aria-expanded");
  if (initialAdvancedState !== "false") {
    throw new Error(
      `treatment manual Advanced section did not start collapsed: aria-expanded=${initialAdvancedState}, html=${await advanced.evaluate((element) => element.outerHTML)}`,
    );
  }
  const advancedLabels = [
    "ICON",
    "COLOR",
    "UNIT",
    "TARGET",
    "SMART METRIC",
    "Smart Reminders",
    "Merge similar habits",
  ];
  for (const label of advancedLabels) {
    if ((await page.getByText(label, { exact: true }).count()) !== 0) {
      throw new Error(`treatment manual form exposed hidden advanced group: ${label}`);
    }
  }
  const collapsed = await snap("collapsed");
  if (!collapsed.includes("Target: 2000 ml") || !collapsed.includes("Reminders: on")) {
    throw new Error("treatment manual summary did not show target and reminders");
  }

  await advanced.click();
  for (const label of advancedLabels) {
    await page.getByText(label, { exact: true }).first().waitFor({ timeout: 10000 });
  }
  await page.getByPlaceholder("e.g. 2000").fill("100");
  await snap("advanced");

  const createButton = page.getByRole("button", { name: "Create habit", exact: true });
  await createButton.scrollIntoViewIfNeeded();
  const createRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" && new URL(request.url()).pathname.includes("/rest/v1/habits"),
    { timeout: 15000 },
  );
  await createButton.evaluate((button) => {
    button.click();
    button.click();
  });
  await createRequest;
  try {
    const savingButton = page.getByRole("button", { name: "Saving...", exact: true });
    await savingButton.waitFor({ timeout: 10000 });
    if (!(await savingButton.isDisabled())) {
      throw new Error("treatment manual Create action was not disabled while saving");
    }
  } finally {
    releaseCreate();
  }

  await page
    .getByText("Let's log your first habit together", { exact: true })
    .waitFor({ timeout: 30000 });
  const firstLog = await snap("first-log");
  if (!firstLog.includes("Saved Drink Water") || !firstLog.includes("Daily goal: 80 ml")) {
    throw new Error("first-log flow did not use the authoritative saved habit");
  }
  if (submittedPayload?.target !== 100 || submittedPayload?.default_log_value !== 100) {
    throw new Error(
      `treatment target/default-log payload was not capped: ${JSON.stringify(submittedPayload)}`,
    );
  }

  const logButton = page.getByRole("button", { name: "Log 20 ml", exact: true });
  const completionRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname.includes("/rest/v1/rpc/log_habit_completion"),
    { timeout: 15000 },
  );
  await logButton.evaluate((button) => {
    button.click();
    button.click();
  });
  await completionRequest;
  try {
    const loggingButton = page.getByRole("button", { name: "Logging...", exact: true });
    await loggingButton.waitFor({ timeout: 10000 });
    if (!(await loggingButton.isDisabled())) {
      throw new Error("first-log action was not disabled while logging");
    }
  } finally {
    releaseCompletion();
  }

  await page.getByText("First Step", { exact: true }).waitFor({ timeout: 30000 });
  if (!new URL(page.url()).pathname.includes("/habits/new")) {
    throw new Error("first log skipped the dedicated celebration state");
  }
  await snap("first-step");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const maybeLater = page.getByRole("button", { name: "Maybe later", exact: true });
  await maybeLater.waitFor({ timeout: 10000 });
  const markerBeforeDismiss = await page.evaluate(
    (key) => localStorage.getItem(key),
    notificationMarker,
  );
  if (markerBeforeDismiss !== "1") {
    throw new Error("notification primer rendered before its durable user-scoped marker");
  }
  await maybeLater.click();

  await page.waitForURL((url) => url.pathname === "/", { timeout: 30000 });
  await page.getByText("20 / 80 ml", { exact: true }).waitFor({ timeout: 30000 });
  const finalText = await snap("dashboard");
  const storedMarker = await page.evaluate((key) => localStorage.getItem(key), notificationMarker);
  const result = {
    insertCount,
    completionRpcCount,
    submittedPayload,
    authoritativeHabit,
    completionValue,
    storedMarker,
    snapshots,
    pageErrors,
    unexpectedBackendCalls,
  };
  fs.writeFileSync(
    "tmp/treatment-manual-habit-smoke-current.json",
    JSON.stringify(result, null, 2),
  );
  await browser.close();

  if (insertCount !== 1)
    throw new Error(`expected one treatment manual insert, got ${insertCount}`);
  if (completionRpcCount !== 1) {
    throw new Error(`expected one guarded first-log RPC, got ${completionRpcCount}`);
  }
  if (storedMarker !== "1") throw new Error("notification offer marker was not persisted");
  if (!finalText.includes("Saved Drink Water") || !finalText.includes("20 / 80 ml")) {
    throw new Error("treatment manual habit was not visible on the final dashboard");
  }
  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join("\n")}`);
  if (unexpectedBackendCalls.length) {
    throw new Error(`unexpected backend calls: ${JSON.stringify(unexpectedBackendCalls)}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
