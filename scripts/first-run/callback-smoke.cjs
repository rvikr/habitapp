const { chromium } = require('playwright');
const fs = require('fs');

const pendingSignupKey = 'habbit:pending-signup-email';
const email = 'first-user-callback-smoke@example.invalid';
let pageForFailureCapture = null;

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split('.')[0] || 'default';
  } catch {
    return 'default';
  }
}

const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://not-configured.supabase.co';
const authStorageKeys = Array.from(new Set([
  `sb-${projectRefFromUrl(configuredSupabaseUrl)}-auth-token`,
  'sb-not-configured-auth-token',
  'sb-ehcqgoymkmljwoveisbl-auth-token',
]));

function fakeSession() {
  const userId = '00000000-0000-4000-8000-000000000123';
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'callback-smoke-access-token',
    refresh_token: 'callback-smoke-refresh-token',
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [{ id: userId, user_id: userId, provider: 'email', identity_data: { email, sub: userId } }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

async function snapshot(page, label, snapshots) {
  const text = await page.locator('body').innerText({ timeout: 10000 });
  await page.screenshot({ path: `tmp/first-run-callback-${label}.png`, fullPage: true });
  snapshots.push({ label, url: page.url(), text: text.slice(0, 3000) });
  if (text.includes('undefined')) throw new Error(`${label} rendered undefined`);
  return text;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  pageForFailureCapture = page;
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  const tokenCalls = [];
  const userCalls = [];
  const syncSubscriptionCalls = [];
  const profileCalls = [];
  const unexpectedBackendCalls = [];
  const snapshots = [];
  const session = fakeSession();

  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(String(err.stack || err.message || err)));
  page.on('requestfailed', req => requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? null }));

  await page.addInitScript(({ pendingSignupKey, email, authStorageKeys }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(pendingSignupKey, email);
    for (const key of authStorageKeys) {
      localStorage.setItem(`${key}-code-verifier`, 'first-run-callback-code-verifier');
    }
  }, { pendingSignupKey, email, authStorageKeys });

  await page.route('**/*.supabase.co/**', route => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    const call = { method: req.method(), url: req.url(), body: req.postData() };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (req.method() === 'POST' && url.pathname.includes('/auth/v1/token')) {
      tokenCalls.push(call);
      return route.fulfill({ status: 200, headers, body: JSON.stringify(session) });
    }
    if (req.method() === 'GET' && url.pathname.includes('/auth/v1/user')) {
      userCalls.push(call);
      return route.fulfill({ status: 200, headers, body: JSON.stringify(session.user) });
    }
    if (req.method() === 'POST' && url.pathname.includes('/functions/v1/sync-subscription')) {
      syncSubscriptionCalls.push(call);
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) });
    }
    if (req.method() === 'GET' && url.pathname.includes('/rest/v1/profiles')) {
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
      body: JSON.stringify({ message: 'unmocked callback endpoint', path: url.pathname, method: req.method() }),
    });
  });

  await page.goto('http://localhost:8083/auth/callback?code=first-run-confirm-code&type=signup', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.getByText('Congratulations, your email is confirmed!').waitFor({ timeout: 30000 });
  const confirmedText = await snapshot(page, 'confirmed', snapshots);
  for (const expected of [
    'Congratulations, your email is confirmed!',
    'Refresh the app or sign in to start using Lagan.',
    'Continue to app',
    'Sign in',
  ]) {
    if (!confirmedText.includes(expected)) throw new Error(`callback confirmation missing ${expected}`);
  }

  const pendingAfterConfirm = await page.evaluate(key => localStorage.getItem(key), pendingSignupKey);
  if (pendingAfterConfirm !== null) throw new Error('pending signup email was not consumed after confirmation');
  if (tokenCalls.length !== 1) throw new Error(`expected one PKCE token exchange, got ${tokenCalls.length}`);
  if (unexpectedBackendCalls.length) {
    fs.writeFileSync(
      'tmp/first-run-smoke-callback-unexpected.json',
      JSON.stringify({ tokenCalls, userCalls, syncSubscriptionCalls, profileCalls, unexpectedBackendCalls }, null, 2),
    );
    throw new Error('callback smoke hit unexpected backend endpoints');
  }

  await browser.close();

  const result = {
    snapshots,
    tokenCalls,
    userCalls,
    syncSubscriptionCalls,
    profileCalls,
    unexpectedBackendCalls,
    consoleMessages,
    pageErrors,
    requestFailures,
  };
  fs.writeFileSync('tmp/first-run-smoke-callback-current.json', JSON.stringify(result, null, 2));
  if (pageErrors.length) process.exit(2);
})().catch(async err => {
  try {
    // Keep a failure artifact because callback failures often render localized
    // screen copy rather than throwing into the Node process.
    if (pageForFailureCapture) {
      const text = await pageForFailureCapture.locator('body').innerText({ timeout: 1000 }).catch(() => '');
      await pageForFailureCapture.screenshot({ path: 'tmp/first-run-callback-failure.png', fullPage: true }).catch(() => {});
      fs.writeFileSync('tmp/first-run-smoke-callback-failure.json', JSON.stringify({ text, error: String(err) }, null, 2));
    }
  } catch {
    // Best-effort artifact capture only.
  }
  console.error(err);
  process.exit(1);
});
