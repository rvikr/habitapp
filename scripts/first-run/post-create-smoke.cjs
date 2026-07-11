const { chromium } = require("playwright");
const fs = require("fs");

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
  const habitId = payload?.p_habit_id;
  const completedOn = payload?.p_completed_on;
  const increment = payload?.p_increment;
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
  return { habitId, completedOn, increment };
}

function assertMalformedRpcPayloadsFail() {
  if (typeof parseRpcIncrementPayload !== "function") {
    throw new Error("post-create smoke is missing strict RPC payload validation");
  }
  const today = localDateKey();
  const invalidPayloads = [
    {},
    { p_completed_on: today, p_increment: 250 },
    { p_habit_id: "mock-habit-1", p_increment: 250 },
    { p_habit_id: "mock-habit-1", p_completed_on: today },
    { p_habit_id: "", p_completed_on: today, p_increment: 250 },
    { p_habit_id: "mock-habit-1", p_completed_on: "not-a-date", p_increment: 250 },
    { p_habit_id: "mock-habit-1", p_completed_on: today, p_increment: "250" },
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

async function setup(page, session) {
  const storageKey = "sb-ehcqgoymkmljwoveisbl-auth-token";
  let habitInsertCount = 0;
  const today = localDateKey();
  const createdHabits = [];
  const completionRows = [];
  const rpcIncrementCalls = [];
  const directCompletionWrites = [];
  await page.addInitScript(
    ({ storageKey, session }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(session));
    },
    { storageKey, session },
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
    if (path.includes("/rest/v1/rpc/log_habit_completion")) {
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
      const { habitId, completedOn, increment } = parsed;
      rpcIncrementCalls.push({ habitId, completedOn, increment });
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
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) });
    }
    if (path.includes("/rest/v1/feature_flags"))
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ enabled: false }) });
    if (path.includes("/rest/v1/profiles"))
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          display_name: null,
          coach_tone: "friendly",
          is_pro: false,
          pro_trial_ends_at: null,
          revenuecat_entitlement_active: false,
          pro_expires_at: null,
        }),
      });
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
  };
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on("console", (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => pageErrors.push(String(err.stack || err.message || err)));
  page.on("requestfailed", (req) =>
    requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? null }),
  );
  const harness = await setup(page, fakeSession());
  const snapshots = [];
  async function snap(label) {
    const text = await page.locator("body").innerText({ timeout: 10000 });
    await page.screenshot({
      path: `tmp/first-run-post-${scenario.id}-${label}.png`,
      fullPage: true,
    });
    snapshots.push({ label, url: page.url(), text: text.slice(0, 3000) });
    return text;
  }

  await page.goto("http://localhost:8083/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForURL(/habits\/wizard/, { timeout: 15000 });
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
  await page
    .getByText(/Let's (?:log|complete) your first habit together|Enable reminders/)
    .waitFor({ timeout: 30000 });
  const afterBegin = await snap("after-begin");
  if (/Enable reminders|Maybe later|Continue/.test(afterBegin)) {
    const maybe = page.getByText(/Maybe later|Continue/).last();
    await maybe.click({ timeout: 10000 });
    await page.getByText(scenario.tutorialHeading).waitFor({ timeout: 30000 });
    await snap("after-reminder-primer");
  }
  await page.getByText(scenario.tutorialHeading).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: scenario.actionLabel, exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/" && url.searchParams.get("newUser") === "1", {
    timeout: 30000,
  });
  await page.getByText(scenario.dashboardHabit, { exact: true }).waitFor({ timeout: 30000 });
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
  await page.close();

  const result = {
    counts: harness.getCounts(),
    completionRows: harness.getCompletionRows(),
    rpcIncrementCalls: harness.getRpcIncrementCalls(),
    directCompletionWrites: harness.getDirectCompletionWrites(),
    booleanCompleted,
    snapshots,
    consoleMessages,
    pageErrors,
    requestFailures,
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
    const [rpcCall] = result.rpcIncrementCalls;
    if (
      result.rpcIncrementCalls.length !== 1 ||
      rpcCall.habitId !== "mock-habit-1" ||
      rpcCall.completedOn !== scenario.expectedCompletedOn ||
      rpcCall.increment !== 250 ||
      result.directCompletionWrites.length !== 0
    ) {
      throw new Error(`[quantity] Expected one exact RPC increment and zero direct writes`);
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
  return result;
}

(async () => {
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
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
