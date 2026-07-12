const { chromium } = require("playwright");
const fs = require("fs");
const { captureStableScreenshot, prepareScreenshotPage } = require("./screenshot-helper.cjs");
const {
  assertActivationAnalyticsSafe,
  installAnalyticsCollector,
  requireAnalyticsEvent,
} = require("./analytics-events.cjs");

function fakeSession() {
  const userId = "00000000-0000-4000-8000-000000000001";
  const email = "first-user-smoke@example.invalid";
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "fake-access-token",
    refresh_token: "fake-refresh-token",
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

function parseRpcIncrementPayload(payload) {
  const operationId = payload?.p_operation_id;
  const habitId = payload?.p_habit_id;
  const completedOn = payload?.p_completed_on;
  const increment = payload?.p_increment;
  if (
    typeof operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)
  ) {
    throw new Error("log_habit_completion_once requires a UUID operation id");
  }
  if (typeof habitId !== "string" || habitId.trim() === "") {
    throw new Error("log_habit_completion requires p_habit_id");
  }
  if (typeof completedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(completedOn)) {
    throw new Error("log_habit_completion requires p_completed_on");
  }
  const [year, month, day] = completedOn.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    throw new Error("log_habit_completion requires a valid p_completed_on date");
  }
  if (typeof increment !== "number" || !Number.isFinite(increment) || increment <= 0) {
    throw new Error("log_habit_completion requires a positive numeric p_increment");
  }
  return { operationId, habitId, completedOn, increment };
}

function assertMalformedRpcPayloadsFail() {
  if (typeof parseRpcIncrementPayload !== "function") {
    throw new Error("post-create smoke is missing strict RPC payload validation");
  }
  const today = localDateKey();
  const operationId = "30000000-0000-4000-8000-000000000001";
  const invalidPayloads = [
    {},
    {
      p_operation_id: "not-a-uuid",
      p_habit_id: "mock-habit-1",
      p_completed_on: today,
      p_increment: 250,
    },
    { p_operation_id: operationId, p_completed_on: today, p_increment: 250 },
    { p_operation_id: operationId, p_habit_id: "mock-habit-1", p_increment: 250 },
    { p_operation_id: operationId, p_habit_id: "mock-habit-1", p_completed_on: today },
    { p_operation_id: operationId, p_habit_id: "", p_completed_on: today, p_increment: 250 },
    {
      p_operation_id: operationId,
      p_habit_id: "mock-habit-1",
      p_completed_on: "not-a-date",
      p_increment: 250,
    },
    {
      p_operation_id: operationId,
      p_habit_id: "mock-habit-1",
      p_completed_on: today,
      p_increment: "250",
    },
  ];
  for (const payload of invalidPayloads) {
    let rejected = false;
    try {
      parseRpcIncrementPayload(payload);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error(`malformed RPC payload was accepted: ${JSON.stringify(payload)}`);
    }
  }
}

async function setup(page, session, scenario) {
  const storageKey = "sb-ehcqgoymkmljwoveisbl-auth-token";
  let habitInsertCount = 0;
  let rpcReplayEnabled = !scenario.reloadBeforeReplay;
  let serverFirstLoggedAt = null;
  const today = localDateKey();
  const createdHabits = [];
  const completionRows = [];
  const rpcIncrementCalls = [];
  const incrementReceipts = new Map();
  const directCompletionWrites = [];
  const profileReads = [];
  await page.addInitScript(
    ({ storageKey, session, preserveStorageOnReload, initName }) => {
      if (preserveStorageOnReload && window.name === initName) return;
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(session));
      if (preserveStorageOnReload) window.name = initName;
    },
    {
      storageKey,
      session,
      preserveStorageOnReload: Boolean(scenario.reloadBeforeReplay),
      initName: `lagan-${scenario.id}`,
    },
  );
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const headers = { "content-type": "application/json", "access-control-allow-origin": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path.includes("/functions/v1/sync-subscription"))
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) });
    if (path.includes("/functions/v1/validate-habit"))
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ status: "allow" }) });
    if (path.includes("/auth/v1/user"))
      return route.fulfill({ status: 200, headers, body: JSON.stringify(session.user) });
    if (path.includes("/rest/v1/rpc/get_completion_dates"))
      return route.fulfill({
        status: 200,
        headers,
        body: completionRows.length > 0 ? JSON.stringify([today]) : "[]",
      });
    if (path.endsWith("/rest/v1/rpc/log_habit_completion_once")) {
      let parsed;
      try {
        parsed = parseRpcIncrementPayload(JSON.parse(req.postData() || "{}"));
      } catch (error) {
        return route.fulfill({
          status: 400,
          headers,
          body: JSON.stringify({
            message: error instanceof Error ? error.message : "Malformed RPC",
          }),
        });
      }
      const { operationId, habitId, completedOn, increment } = parsed;
      const fingerprint = JSON.stringify({ habitId, completedOn, increment, note: null });
      if (scenario.reloadBeforeReplay && !rpcReplayEnabled) {
        rpcIncrementCalls.push({
          operationId,
          habitId,
          completedOn,
          increment,
          applied: false,
          transport: "offline",
        });
        return route.abort("failed");
      }
      const priorFingerprint = incrementReceipts.get(operationId);
      if (priorFingerprint != null && priorFingerprint !== fingerprint) {
        return route.fulfill({
          status: 400,
          headers,
          body: JSON.stringify({ message: "idempotency key reused with different payload" }),
        });
      }
      const applied = priorFingerprint == null;
      rpcIncrementCalls.push({ operationId, habitId, completedOn, increment, applied });
      if (applied) {
        incrementReceipts.set(operationId, fingerprint);
        serverFirstLoggedAt ??= new Date().toISOString();
        const existingIndex = completionRows.findIndex(
          (item) => item.habit_id === habitId && item.completed_on === completedOn,
        );
        const existing = existingIndex >= 0 ? completionRows[existingIndex] : null;
        const normalized = {
          habit_id: habitId,
          completed_on: completedOn,
          created_at: existing?.created_at || new Date().toISOString(),
          value: Number(existing?.value ?? 0) + increment,
        };
        if (existingIndex >= 0) completionRows[existingIndex] = normalized;
        else completionRows.push(normalized);
      }
      if (scenario.kind === "quantity" && rpcIncrementCalls.length === 1) {
        return route.abort("failed");
      }
      return route.fulfill({ status: 200, headers, body: JSON.stringify(applied) });
    }
    if (path.includes("/rest/v1/feature_flags"))
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ enabled: false }) });
    if (path.endsWith("/rest/v1/rpc/set_profile_time_zone")) {
      return route.fulfill({ status: 200, headers, body: JSON.stringify("UTC") });
    }
    if (path.includes("/rest/v1/profiles")) {
      profileReads.push({ first_habit_logged_at: serverFirstLoggedAt });
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          first_habit_logged_at: serverFirstLoggedAt,
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
    if (path.includes("/rest/v1/habit_completions")) {
      if (req.method() === "POST" || req.method() === "PATCH") {
        const payload = JSON.parse(req.postData() || "{}");
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          const habitId = row.habit_id || "mock-habit-1";
          const existingIndex = completionRows.findIndex(
            (item) =>
              item.habit_id === habitId && item.completed_on === (row.completed_on || today),
          );
          const normalized = {
            habit_id: habitId,
            completed_on: row.completed_on || today,
            created_at: new Date().toISOString(),
            value: row.value ?? null,
          };
          directCompletionWrites.push({ ...normalized });
          if (existingIndex >= 0) completionRows[existingIndex] = normalized;
          else completionRows.push(normalized);
        }
        return route.fulfill({ status: 201, headers, body: JSON.stringify(completionRows) });
      }
      return route.fulfill({
        status: 200,
        headers,
        body: req.method() === "HEAD" ? "" : JSON.stringify(completionRows),
      });
    }
    if (path.includes("/rest/v1/habits")) {
      if (req.method() === "GET" || req.method() === "HEAD") {
        const rows = habitInsertCount > 0 ? createdHabits : [];
        return route.fulfill({
          status: 200,
          headers,
          body: req.method() === "HEAD" ? "" : JSON.stringify(rows),
        });
      }
      if (req.method() === "POST") {
        habitInsertCount += 1;
        const payload = JSON.parse(req.postData() || "{}");
        const habit = {
          id: `mock-habit-${habitInsertCount}`,
          user_id: session.user.id,
          name: payload.name || `Mock Habit ${habitInsertCount}`,
          description: payload.description || "",
          icon: payload.icon || "check_circle",
          color: payload.color || "primary",
          unit: payload.unit || "times",
          target: payload.target || 1,
          reminders_enabled: payload.reminders_enabled ?? true,
          reminder_times: payload.reminder_times || [],
          reminder_days: payload.reminder_days || [0, 1, 2, 3, 4, 5, 6],
          habit_type: payload.habit_type || "custom",
          metric_type: payload.metric_type || "count",
          visual_type: payload.visual_type || "progress_ring",
          reminder_strategy: payload.reminder_strategy || "manual",
          reminder_interval_minutes: payload.reminder_interval_minutes ?? null,
          default_log_value: payload.default_log_value ?? payload.target ?? 1,
          archived_at: null,
          created_at: new Date().toISOString(),
        };
        createdHabits.push(habit);
        return route.fulfill({ status: 201, headers, body: JSON.stringify(habit) });
      }
      if (req.method() === "PATCH")
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify([{ id: "mock-habit-existing" }]),
        });
    }
    return route.fulfill({
      status: 500,
      headers,
      body: JSON.stringify({ message: "unmocked supabase endpoint", path, method: req.method() }),
    });
  });
  return {
    getCounts: () => ({
      habitInsertCount,
      rpcIncrementCount: rpcIncrementCalls.length,
      directCompletionWriteCount: directCompletionWrites.length,
    }),
    getCompletionRows: () => completionRows.map((row) => ({ ...row })),
    getRpcIncrementCalls: () => rpcIncrementCalls.map((call) => ({ ...call })),
    getDirectCompletionWrites: () => directCompletionWrites.map((row) => ({ ...row })),
    getProfileReads: () => profileReads.map((read) => ({ ...read })),
    enableRpcReplay: () => {
      rpcReplayEnabled = true;
    },
    waitForRpcCount: async (expected, timeoutMs = 15000) => {
      const deadline = Date.now() + timeoutMs;
      while (rpcIncrementCalls.length < expected && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (rpcIncrementCalls.length < expected) {
        throw new Error(
          `expected ${expected} idempotent RPC attempts, got ${rpcIncrementCalls.length}`,
        );
      }
    },
  };
}

async function readReloadPersistence(page, userId) {
  return page.evaluate(
    ({ queueKey, markerKey }) => {
      const rawQueue = localStorage.getItem(queueKey);
      let queue = [];
      try {
        const parsed = rawQueue ? JSON.parse(rawQueue) : [];
        if (Array.isArray(parsed)) queue = parsed;
      } catch {
        queue = [];
      }
      return {
        queue,
        optimisticMarker: localStorage.getItem(markerKey),
      };
    },
    {
      queueKey: "habbit:pending-completions",
      markerKey: `habbit:activation:first-log:${userId}`,
    },
  );
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  await prepareScreenshotPage(page);
  const analyticsCollector = installAnalyticsCollector(page);
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on("console", (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => pageErrors.push(String(err.stack || err.message || err)));
  page.on("requestfailed", (req) =>
    requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? null }),
  );
  const session = fakeSession();
  const harness = await setup(page, session, scenario);
  const snapshots = [];
  let reloadEvidence = null;
  async function snap(label) {
    const text = await page.locator("body").innerText({ timeout: 10000 });
    await captureStableScreenshot(page, {
      finalUrl: page.url(),
      target: "body",
      screenshot: {
        path: `tmp/first-run-post-${scenario.id}-${label}.png`,
        fullPage: true,
      },
    });
    snapshots.push({ label, url: page.url(), text: text.slice(0, 3000) });
    return text;
  }

  await page.goto("http://localhost:8083/", { waitUntil: "domcontentloaded", timeout: 60000 });
  try {
    await page.waitForURL(/habits\/wizard/, { timeout: 15000 });
  } catch (error) {
    console.error(`[${scenario.id}] wizard did not open`, {
      url: page.url(),
      body: await page
        .locator("body")
        .innerText()
        .catch(() => "<unavailable>"),
      consoleMessages,
      pageErrors,
    });
    throw error;
  }
  await page.getByText("Energy").click();
  if (scenario.kind === "boolean") {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Student", { exact: true }).click();
    for (let i = 0; i < 6; i += 1)
      await page.getByRole("button", { name: "Next", exact: true }).click();
  } else {
    for (let i = 0; i < 7; i += 1)
      await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByText("Build routine").click();
  await page.getByText("Create routine").waitFor({ timeout: 30000 });
  for (const habitName of scenario.removeHabits) {
    await page
      .getByRole("button", { name: `Remove ${habitName}`, exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: `Add ${habitName}`, exact: true })
      .waitFor({ timeout: 10000 });
  }
  await page.getByText("Create routine").click();
  await page.getByText("Your routine is ready").waitFor({ timeout: 30000 });
  await snap("confirm");
  await page.getByText("Let's begin").click();
  await page.getByText(scenario.tutorialHeading).waitFor({ timeout: 30000 });
  await snap("after-begin");
  const actionButton = page.getByRole("button", { name: scenario.actionLabel, exact: true });
  await actionButton.evaluate((button) => {
    button.click();
    button.click();
  });
  await page.getByText("First Step", { exact: true }).waitFor({ timeout: 30000 });
  await snap("first-step");
  let notificationPromptVisible = false;
  if (scenario.reloadBeforeReplay) {
    await analyticsCollector.settle();
    const beforeReload = await readReloadPersistence(page, session.user.id);
    const [queuedBeforeReload] = beforeReload.queue;
    const [initialCall] = harness.getRpcIncrementCalls();
    if (
      beforeReload.queue.length !== 1 ||
      queuedBeforeReload.kind !== "increment_once" ||
      queuedBeforeReload.operationId !== initialCall?.operationId ||
      beforeReload.optimisticMarker !== "1"
    ) {
      throw new Error(
        `[${scenario.id}] first log was not durably queued before reload: ${JSON.stringify(beforeReload)}`,
      );
    }
    const firstLogEventsBeforeReload = analyticsCollector.events.filter(
      (event) => event.name === "first_habit_logged",
    ).length;
    if (firstLogEventsBeforeReload !== 1) {
      throw new Error(
        `[${scenario.id}] expected one first-log event before reload, got ${firstLogEventsBeforeReload}`,
      );
    }

    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForURL(/habits\/wizard/, { timeout: 30000 });
    await page.getByText("STEP 1 OF 8", { exact: true }).waitFor({ timeout: 30000 });
    const afterReload = await readReloadPersistence(page, session.user.id);
    const [queuedAfterReload] = afterReload.queue;
    if (
      afterReload.queue.length !== 1 ||
      queuedAfterReload.id !== queuedBeforeReload.id ||
      queuedAfterReload.operationId !== queuedBeforeReload.operationId ||
      afterReload.optimisticMarker !== "1"
    ) {
      throw new Error(
        `[${scenario.id}] queued first log did not survive reload unchanged: ${JSON.stringify(afterReload)}`,
      );
    }

    harness.enableRpcReplay();
    await page.goto("http://localhost:8083/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    reloadEvidence = { beforeReload, afterReload, firstLogEventsBeforeReload };
  } else {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const maybeLater = page.getByRole("button", { name: "Maybe later", exact: true });
    try {
      await maybeLater.waitFor({ timeout: 5000 });
      notificationPromptVisible = true;
      await maybeLater.click();
    } catch {
      // A denied browser permission correctly skips the notification primer.
    }
    await page.waitForURL(
      (url) => url.pathname === "/" && url.searchParams.get("newUser") === "1",
      { timeout: 30000 },
    );
  }
  await page.getByText(scenario.dashboardHabit, { exact: true }).waitFor({ timeout: 30000 });
  if (scenario.kind === "quantity") await harness.waitForRpcCount(2);
  if (scenario.reloadBeforeReplay) {
    await page.waitForFunction(
      ({ queueKey, markerKey }) =>
        localStorage.getItem(queueKey) === null && localStorage.getItem(markerKey) === null,
      {
        queueKey: "habbit:pending-completions",
        markerKey: `habbit:activation:first-log:${session.user.id}`,
      },
      { timeout: 30000 },
    );
    reloadEvidence.afterReplay = await readReloadPersistence(page, session.user.id);
  }
  let booleanCompleted = false;
  if (scenario.kind === "boolean") {
    const completedToggle = page.getByRole("checkbox", {
      name: "Mark Screen Limit not done",
      exact: true,
    });
    await completedToggle.waitFor({ timeout: 30000 });
    booleanCompleted =
      (await completedToggle.getAttribute("aria-label")) === "Mark Screen Limit not done";
  }
  await snap(scenario.kind === "quantity" ? "after-log" : "after-complete");
  await analyticsCollector.settle();
  await page.close();

  const result = {
    counts: harness.getCounts(),
    completionRows: harness.getCompletionRows(),
    rpcIncrementCalls: harness.getRpcIncrementCalls(),
    directCompletionWrites: harness.getDirectCompletionWrites(),
    profileReads: harness.getProfileReads(),
    reloadEvidence,
    booleanCompleted,
    snapshots,
    consoleMessages,
    pageErrors,
    requestFailures,
    analyticsEvents: analyticsCollector.events,
  };
  if (pageErrors.length)
    throw new Error(`[${scenario.id}] Browser page errors: ${pageErrors.join("\n")}`);
  const final = snapshots[snapshots.length - 1]?.text ?? "";
  if (!/Hey,|TODAY'S TIMELINE|Welcome to Lagan|Build your first routine|Drink Water/.test(final)) {
    throw new Error(`[${scenario.id}] Did not reach dashboard-like final state`);
  }
  if (result.counts.habitInsertCount !== scenario.expectedHabitCount) {
    throw new Error(
      `[${scenario.id}] Expected ${scenario.expectedHabitCount} created habits, got ${result.counts.habitInsertCount}`,
    );
  }
  const completion = result.completionRows.find((row) => row.habit_id === "mock-habit-1");
  if (
    !completion ||
    !completion.completed_on ||
    completion.value !== scenario.expectedCompletionValue
  ) {
    throw new Error(
      `[${scenario.id}] Expected completion row mock-habit-1 with value ${scenario.expectedCompletionValue}`,
    );
  }
  if (scenario.kind === "quantity" && !final.includes("250 / 2000 ml")) {
    throw new Error("Expected dashboard to preserve the tutorial partial progress: 250 / 2000 ml");
  }
  if (scenario.kind === "quantity") {
    const [initialCall, replayCall] = result.rpcIncrementCalls;
    const expectedInitialApplied = scenario.reloadBeforeReplay ? false : true;
    const expectedReplayApplied = scenario.reloadBeforeReplay ? true : false;
    if (
      result.rpcIncrementCalls.length !== 2 ||
      initialCall.operationId !== replayCall.operationId ||
      initialCall.applied !== expectedInitialApplied ||
      replayCall.applied !== expectedReplayApplied ||
      (scenario.reloadBeforeReplay && initialCall.transport !== "offline") ||
      initialCall.habitId !== "mock-habit-1" ||
      initialCall.completedOn !== scenario.expectedCompletedOn ||
      initialCall.increment !== 250 ||
      result.directCompletionWrites.length !== 0
    ) {
      throw new Error(
        `[${scenario.id}] Expected one quantity increment across two attempts with the same UUID`,
      );
    }
  }
  if (scenario.reloadBeforeReplay) {
    if (
      !result.reloadEvidence ||
      result.reloadEvidence.afterReplay.queue.length !== 0 ||
      result.reloadEvidence.afterReplay.optimisticMarker !== null ||
      !result.profileReads.some((read) => read.first_habit_logged_at)
    ) {
      throw new Error(
        `[${scenario.id}] queue replay did not reconcile to an authoritative first-log milestone`,
      );
    }
  }
  if (scenario.kind === "boolean" && (!booleanCompleted || !/Done\s+1 \/ 1/.test(final))) {
    throw new Error("Expected boolean tutorial habit to reach a completed 1 / 1 dashboard state");
  }
  if (scenario.kind === "boolean") {
    const [directWrite] = result.directCompletionWrites;
    if (
      result.rpcIncrementCalls.length !== 0 ||
      result.directCompletionWrites.length !== 1 ||
      directWrite.habit_id !== "mock-habit-1" ||
      directWrite.completed_on !== scenario.expectedCompletedOn ||
      directWrite.value !== 1
    ) {
      throw new Error(`[boolean] Expected one exact direct write and zero RPC increments`);
    }
  }
  const firstLogEvents = result.analyticsEvents.filter(
    (event) =>
      event.name === "first_habit_logged" &&
      event.properties.activation_variant === "control" &&
      event.properties.activation_stage === "first_log" &&
      event.properties.rollout_percentage === 0 &&
      event.properties.queued === scenario.expectedQueued,
  );
  if (firstLogEvents.length !== 1) {
    throw new Error(`[${scenario.id}] Expected exactly one monotonic first-log analytics event`);
  }
  assertActivationAnalyticsSafe(firstLogEvents[0]);
  if (notificationPromptVisible) {
    const prompt = requireAnalyticsEvent(
      result.analyticsEvents,
      "notification_prompt_shown",
      (event) =>
        event.properties.surface === "first_log_flow" &&
        event.properties.activation_stage === "first_log",
    );
    assertActivationAnalyticsSafe(prompt);
  }
  return result;
}

async function main() {
  assertMalformedRpcPayloadsFail();
  const browser = await chromium.launch({ headless: true });
  const scenarios = [
    {
      id: "quantity",
      kind: "quantity",
      tutorialHeading: "Let's log your first habit together",
      actionLabel: "Log 250 ml",
      dashboardHabit: "Drink Water",
      removeHabits: [],
      expectedHabitCount: 4,
      expectedCompletionValue: 250,
      expectedCompletedOn: localDateKey(),
      expectedQueued: true,
    },
    {
      id: "boolean",
      kind: "boolean",
      tutorialHeading: "Let's complete your first habit together",
      actionLabel: "Complete",
      dashboardHabit: "Screen Limit",
      removeHabits: ["Focus Session", "Revision Block", "Read", "Walk"],
      expectedHabitCount: 1,
      expectedCompletionValue: 1,
      expectedCompletedOn: localDateKey(),
      expectedQueued: false,
    },
  ];
  const results = [];
  try {
    for (const scenario of scenarios) {
      results.push({ id: scenario.id, ...(await runScenario(browser, scenario)) });
      fs.writeFileSync(
        "tmp/first-run-smoke-post-create-current.json",
        JSON.stringify({ scenarios: results }, null, 2),
      );
    }
  } finally {
    await browser.close();
  }
}

module.exports = { runScenario };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
