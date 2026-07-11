const { chromium } = require("playwright");
const fs = require("fs");

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
  const pageErrors = [];
  const unexpectedBackendCalls = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.stack || error.message || error)));

  await page.addInitScript(
    ({ storageKey, session }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(session));
    },
    { storageKey, session },
  );

  await page.route("**/*.supabase.co/**", (route) => {
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
    if (path.includes("/rest/v1/habits") || path.includes("/rest/v1/habit_completions")) {
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

  await page.waitForTimeout(3000);
  const initialText = await page.locator("body").innerText({ timeout: 10000 });
  if (!initialText.includes("STEP 1 OF 3")) {
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

  const text = await page.locator("body").innerText();
  await page.screenshot({ path: "tmp/treatment-quick-start-review.png", fullPage: true });
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
