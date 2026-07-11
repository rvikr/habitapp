const { chromium } = require("playwright");
const {
  assertActivationAnalyticsSafe,
  installAnalyticsCollector,
  requireAnalyticsEvent,
} = require("./analytics-events.cjs");

function fakeSession() {
  const userId = "00000000-0000-4000-8000-000000000009";
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "routine-resilience-access-token",
    refresh_token: "routine-resilience-refresh-token",
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: "bearer",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "routine-resilience@example.invalid",
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
  const session = fakeSession();
  const storageKey = "sb-ehcqgoymkmljwoveisbl-auth-token";
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const page = await context.newPage();
  const analyticsCollector = installAnalyticsCollector(page);
  const pageErrors = [];
  const dialogs = [];
  const unexpectedBackendCalls = [];
  const serverMutations = [];
  const completionCalls = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.stack || error.message || error)));
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });

  await page.addInitScript(
    ({ storageKey, session }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(session));
      const originalFetch = window.fetch.bind(window);
      window.__routineMutationAttempts = 0;
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        const method = String(
          init?.method || (typeof input === "object" && input.method) || "GET",
        ).toUpperCase();
        if (url.includes("/rest/v1/habits") && (method === "POST" || method === "PATCH")) {
          window.__routineMutationAttempts += 1;
          if (window.__routineMutationAttempts === 2) {
            throw new TypeError("Failed to fetch");
          }
        }
        return originalFetch(input, init);
      };
    },
    { storageKey, session },
  );

  const existingWater = {
    id: "00000000-0000-4000-8000-000000000777",
    user_id: session.user.id,
    name: "Hydration Reserve",
    description: "Existing saved water plan",
    icon: "water_drop",
    color: "secondary",
    unit: "ml",
    target: 3000,
    reminder_time: null,
    reminder_times: [],
    reminder_days: [0, 1, 2, 3, 4, 5, 6],
    reminders_enabled: false,
    habit_type: "water_intake",
    metric_type: "volume_ml",
    visual_type: "water_bottle",
    reminder_strategy: "interval",
    reminder_interval_minutes: 120,
    default_log_value: 300,
    created_at: new Date().toISOString(),
    archived_at: null,
  };

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
      if (request.method() === "GET" || request.method() === "HEAD") {
        return route.fulfill({
          status: 200,
          headers,
          body: request.method() === "HEAD" ? "" : JSON.stringify([existingWater]),
        });
      }
      const payload = JSON.parse(request.postData() || "{}");
      serverMutations.push({ method: request.method(), payload });
      if (request.method() === "PATCH") {
        return route.fulfill({ status: 200, headers, body: JSON.stringify(existingWater) });
      }
      if (request.method() === "POST") {
        const saved = {
          ...existingWater,
          ...payload,
          id: "00000000-0000-4000-8000-000000000778",
          name: payload.name,
          created_at: new Date().toISOString(),
        };
        return route.fulfill({ status: 201, headers, body: JSON.stringify(saved) });
      }
    }
    if (path.includes("/rest/v1/rpc/log_habit_completion")) {
      const payload = JSON.parse(request.postData() || "{}");
      completionCalls.push(payload);
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) });
    }
    if (path.includes("/rest/v1/rpc/get_completion_dates")) {
      return route.fulfill({ status: 200, headers, body: "[]" });
    }
    if (path.includes("/rest/v1/habit_completions")) {
      return route.fulfill({
        status: 200,
        headers,
        body: request.method() === "HEAD" ? "" : "[]",
      });
    }
    unexpectedBackendCalls.push({ method: request.method(), url: request.url() });
    return route.fulfill({
      status: 500,
      headers,
      body: JSON.stringify({ message: "unmocked routine resilience endpoint", path }),
    });
  });

  await page.goto("http://localhost:8083/habits/wizard", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  try {
    await page.getByText("STEP 1 OF 3", { exact: true }).waitFor({ timeout: 30000 });
  } catch (error) {
    console.error({
      url: page.url(),
      body: (await page.locator("body").innerText()).slice(0, 1200),
      pageErrors,
      unexpectedBackendCalls,
    });
    throw error;
  }
  await page.getByRole("button", { name: "Select Energy", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Select Office", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Select Low energy", exact: true }).click();
  await page.getByRole("button", { name: "Build routine", exact: true }).click();

  await page.getByText("2 habits selected", { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Add another suggestion", exact: true }).click();
  await page.getByRole("button", { name: "Add Sleep 8 hours", exact: true }).click();
  await page.getByText("3 habits selected", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Create routine", exact: true }).click();

  await page.waitForFunction(() => window.__routineMutationAttempts === 3, null, {
    timeout: 30000,
  });
  await page.getByText("Your routine is ready", { exact: true }).waitFor({ timeout: 30000 });
  await page.getByText("2 habits, ready to go.", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText("Hydration Reserve", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText("Goal: 3000 ml", { exact: true }).waitFor({ timeout: 10000 });

  if (!dialogs.some((message) => message.includes("2 of 3 habits were created"))) {
    throw new Error(`missing partial-save summary: ${JSON.stringify(dialogs)}`);
  }
  if (
    serverMutations.length !== 2 ||
    serverMutations[0].method !== "PATCH" ||
    serverMutations[1].payload?.name !== "Sleep 8 hours"
  ) {
    throw new Error(
      `success/throw/success order was not preserved: ${JSON.stringify(serverMutations)}`,
    );
  }

  await page.getByRole("button", { name: "Let's begin", exact: true }).click();
  await page.getByText("Hydration Reserve", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText("Daily goal: 3000 ml", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Log 300 ml", exact: true }).click();
  await page.getByText("First Step", { exact: true }).waitFor({ timeout: 10000 });

  if (
    completionCalls.length !== 1 ||
    completionCalls[0].p_habit_id !== existingWater.id ||
    completionCalls[0].p_increment !== 300
  ) {
    throw new Error(
      `first log ignored authoritative merge data: ${JSON.stringify(completionCalls)}`,
    );
  }

  await analyticsCollector.settle();
  requireAnalyticsEvent(
    analyticsCollector.events,
    "routine_failed",
    (event) =>
      event.properties.failure_category === "partial_save" &&
      event.properties.requested_count === 3 &&
      event.properties.created_count === 2 &&
      event.properties.failed_count === 1,
  );
  requireAnalyticsEvent(
    analyticsCollector.events,
    "routine_created",
    (event) =>
      event.properties.outcome === "partial" &&
      event.properties.requested_count === 3 &&
      event.properties.created_count === 2 &&
      event.properties.failed_count === 1,
  );
  for (const event of analyticsCollector.events.filter((candidate) =>
    candidate.name.startsWith("routine_"),
  )) {
    assertActivationAnalyticsSafe(event);
  }

  await browser.close();
  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join("\n")}`);
  if (unexpectedBackendCalls.length) {
    throw new Error(`unexpected backend calls: ${JSON.stringify(unexpectedBackendCalls)}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
