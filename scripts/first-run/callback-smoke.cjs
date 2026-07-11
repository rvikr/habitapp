const { chromium } = require("playwright");
const fs = require("fs");

const baseUrl = "http://localhost:8083";
const pendingSignupKey = "habbit:pending-signup-email";
const email = "first-user-callback-smoke@example.invalid";
let pageForFailureCapture = null;
let activeScenario = null;

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split(".")[0] || "default";
  } catch {
    return "default";
  }
}

const configuredSupabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || "https://not-configured.supabase.co";
const authStorageKeys = Array.from(
  new Set([
    `sb-${projectRefFromUrl(configuredSupabaseUrl)}-auth-token`,
    "sb-not-configured-auth-token",
    "sb-ehcqgoymkmljwoveisbl-auth-token",
  ]),
);

function fakeSession() {
  const userId = "00000000-0000-4000-8000-000000000123";
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "callback-smoke-access-token",
    refresh_token: "callback-smoke-refresh-token",
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

async function snapshot(page, label) {
  const text = await page.locator("body").innerText({ timeout: 10000 });
  await page.screenshot({ path: `tmp/first-run-callback-${label}.png`, fullPage: true });
  if (text.includes("undefined")) throw new Error(`${label} rendered undefined`);
  return { label, url: page.url(), text: text.slice(0, 3000) };
}

async function assertSingleAction(page, scenario, expectedAction, forbiddenActions) {
  await page.getByRole("button", { name: expectedAction, exact: true }).waitFor({ timeout: 30000 });
  const actions = (await page.getByRole("button").allInnerTexts()).map((action) => action.trim());
  if (actions.length !== 1) {
    throw new Error(`${scenario} expected exactly one action, got ${JSON.stringify(actions)}`);
  }
  if (actions[0] !== expectedAction) {
    throw new Error(`${scenario} expected action ${expectedAction}, got ${actions[0]}`);
  }
  for (const forbiddenAction of forbiddenActions) {
    const count = await page.getByRole("button", { name: forbiddenAction, exact: true }).count();
    if (count !== 0) {
      throw new Error(`${scenario} unexpectedly rendered action ${forbiddenAction}`);
    }
  }
}

async function runScenario(browser, options) {
  const {
    label,
    callbackPath,
    suppressAuthTokenWrites = false,
    expectedCopy,
    expectedAction,
    forbiddenActions,
    expectedTokenCalls,
  } = options;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const page = await context.newPage();
  pageForFailureCapture = page;
  activeScenario = label;

  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  const tokenCalls = [];
  const userCalls = [];
  const syncSubscriptionCalls = [];
  const profileCalls = [];
  const unexpectedBackendCalls = [];
  const session = fakeSession();

  page.on("console", (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => pageErrors.push(String(err.stack || err.message || err)));
  page.on("requestfailed", (req) =>
    requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? null }),
  );

  await page.addInitScript(
    ({ pendingSignupKey, email, authStorageKeys, suppressAuthTokenWrites }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(pendingSignupKey, email);
      for (const key of authStorageKeys) {
        localStorage.setItem(`${key}-code-verifier`, "first-run-callback-code-verifier");
      }

      if (suppressAuthTokenWrites) {
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function setItem(key, value) {
          if (this === localStorage && authStorageKeys.includes(String(key))) return;
          return originalSetItem.call(this, key, value);
        };
      }
    },
    { pendingSignupKey, email, authStorageKeys, suppressAuthTokenWrites },
  );

  await page.route("**/*.supabase.co/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = { "content-type": "application/json", "access-control-allow-origin": "*" };
    const call = { method: req.method(), url: req.url(), body: req.postData() };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (req.method() === "POST" && url.pathname.includes("/auth/v1/token")) {
      tokenCalls.push(call);
      return route.fulfill({ status: 200, headers, body: JSON.stringify(session) });
    }
    if (req.method() === "GET" && url.pathname.includes("/auth/v1/user")) {
      userCalls.push(call);
      return route.fulfill({ status: 200, headers, body: JSON.stringify(session.user) });
    }
    if (req.method() === "POST" && url.pathname.includes("/functions/v1/sync-subscription")) {
      syncSubscriptionCalls.push(call);
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) });
    }
    if (req.method() === "GET" && url.pathname.includes("/rest/v1/profiles")) {
      profileCalls.push(call);
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          is_pro: false,
          pro_trial_ends_at: null,
          revenuecat_entitlement_active: false,
          pro_expires_at: null,
        }),
      });
    }
    unexpectedBackendCalls.push(call);
    return route.fulfill({
      status: 500,
      headers,
      body: JSON.stringify({
        message: "unmocked callback endpoint",
        path: url.pathname,
        method: req.method(),
      }),
    });
  });

  await page.goto(`${baseUrl}${callbackPath}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  for (const copy of expectedCopy) {
    await page.getByText(copy, { exact: true }).waitFor({ timeout: 30000 });
  }
  await assertSingleAction(page, label, expectedAction, forbiddenActions);
  const scenarioSnapshot = await snapshot(page, label);

  if (tokenCalls.length !== expectedTokenCalls) {
    throw new Error(
      `${label} expected ${expectedTokenCalls} PKCE token exchanges, got ${tokenCalls.length}`,
    );
  }
  if (unexpectedBackendCalls.length) {
    throw new Error(`${label} hit unexpected backend endpoints`);
  }
  if (pageErrors.length) {
    throw new Error(`${label} reported page errors: ${pageErrors.join("\n")}`);
  }

  const result = {
    label,
    snapshot: scenarioSnapshot,
    tokenCalls,
    userCalls,
    syncSubscriptionCalls,
    profileCalls,
    unexpectedBackendCalls,
    consoleMessages,
    pageErrors,
    requestFailures,
  };
  await context.close();
  pageForFailureCapture = null;
  activeScenario = null;
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const scenarios = [];

  scenarios.push(
    await runScenario(browser, {
      label: "confirmed-with-session",
      callbackPath: "/auth/callback?code=first-run-confirm-code&type=signup",
      expectedCopy: [
        "Congratulations, your email is confirmed!",
        "You're signed in and ready to continue to Lagan.",
      ],
      expectedAction: "Continue to app",
      forbiddenActions: ["Sign in", "Back to sign in"],
      expectedTokenCalls: 1,
    }),
  );

  scenarios.push(
    await runScenario(browser, {
      label: "confirmed-without-session",
      callbackPath: "/auth/callback?code=first-run-confirm-code-no-session&type=signup",
      suppressAuthTokenWrites: true,
      expectedCopy: [
        "Congratulations, your email is confirmed!",
        "Your email is confirmed. Sign in to continue to Lagan.",
      ],
      expectedAction: "Sign in",
      forbiddenActions: ["Continue to app", "Back to sign in"],
      expectedTokenCalls: 1,
    }),
  );

  scenarios.push(
    await runScenario(browser, {
      label: "callback-error",
      callbackPath:
        "/auth/callback?error=access_denied&error_description=Confirmation%20link%20expired&type=signup",
      expectedCopy: ["Link could not be opened", "Confirmation link expired"],
      expectedAction: "Back to sign in",
      forbiddenActions: ["Continue to app", "Sign in"],
      expectedTokenCalls: 0,
    }),
  );

  await browser.close();
  fs.writeFileSync(
    "tmp/first-run-smoke-callback-current.json",
    JSON.stringify({ scenarios }, null, 2),
  );
})().catch(async (err) => {
  try {
    if (pageForFailureCapture) {
      const text = await pageForFailureCapture
        .locator("body")
        .innerText({ timeout: 1000 })
        .catch(() => "");
      await pageForFailureCapture
        .screenshot({ path: "tmp/first-run-callback-failure.png", fullPage: true })
        .catch(() => {});
      fs.writeFileSync(
        "tmp/first-run-smoke-callback-failure.json",
        JSON.stringify({ scenario: activeScenario, text, error: String(err) }, null, 2),
      );
    }
  } catch {
    // Best-effort artifact capture only.
  }
  console.error(err);
  process.exit(1);
});
