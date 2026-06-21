const { chromium } = require('playwright');
const fs = require('fs');

function fakeSession() {
  const userId = '00000000-0000-4000-8000-000000000001';
  const email = 'first-user-smoke@example.invalid';
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
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

(async () => {
  const projectRef = 'ehcqgoymkmljwoveisbl';
  const storageKey = 'sb-' + projectRef + '-auth-token';
  const session = fakeSession();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const consoleMessages = [];
  const pageErrors = [];
  const requests = [];
  let habitInsertCount = 0;
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(String(err.stack || err.message || err)));
  page.on('request', req => {
    const url = req.url();
    if (url.includes('supabase.co')) requests.push({ method: req.method(), url, postData: req.postData() });
  });
  await page.addInitScript(({ storageKey, session }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey, session });
  await page.route('**/*.supabase.co/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path.includes('/functions/v1/sync-subscription')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) });
    if (path.includes('/functions/v1/validate-habit')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ status: 'allow' }) });
    if (path.includes('/auth/v1/user')) return route.fulfill({ status: 200, headers, body: JSON.stringify(session.user) });
    if (path.includes('/rest/v1/rpc/get_completion_dates')) return route.fulfill({ status: 200, headers, body: '[]' });
    if (path.includes('/rest/v1/rpc/log_habit_completion')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) });
    if (path.includes('/rest/v1/feature_flags')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ enabled: false }) });
    if (path.includes('/rest/v1/profiles')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ display_name: null, coach_tone: 'friendly', is_pro: false, pro_trial_ends_at: null, revenuecat_entitlement_active: false, pro_expires_at: null }) });
    if (path.includes('/rest/v1/habit_completions')) return route.fulfill({ status: 200, headers, body: req.method() === 'HEAD' ? '' : '[]' });
    if (path.includes('/rest/v1/habits')) {
      if (req.method() === 'GET' || req.method() === 'HEAD') return route.fulfill({ status: 200, headers, body: req.method() === 'HEAD' ? '' : '[]' });
      if (req.method() === 'POST') {
        habitInsertCount += 1;
        return route.fulfill({ status: 201, headers, body: JSON.stringify({ id: `mock-habit-${habitInsertCount}` }) });
      }
      if (req.method() === 'PATCH') return route.fulfill({ status: 200, headers, body: JSON.stringify([{ id: 'mock-habit-existing' }]) });
    }
    return route.fulfill({ status: 500, headers, body: JSON.stringify({ message: 'unmocked supabase endpoint', path, method: req.method() }) });
  });

  await page.goto('http://localhost:8083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForURL(/habits\/wizard/, { timeout: 15000 });
  await page.getByText('Energy').click();
  for (let i = 0; i < 8; i += 1) {
    await page.getByText(i === 7 ? 'Build routine' : 'Next').click();
    await page.waitForTimeout(250);
  }
  await page.getByText('Create routine').waitFor({ timeout: 30000 });
  const reviewText = await page.locator('body').innerText({ timeout: 10000 });
  await page.screenshot({ path: 'tmp/first-run-smoke-wizard-review-current.png', fullPage: true });
  const createButton = page.getByText('Create routine');
  await createButton.click({ timeout: 10000 });
  await page.getByText(/Your routine is ready|Enable reminders|Let's complete your first habit together/).waitFor({ timeout: 30000 });
  const finalText = await page.locator('body').innerText({ timeout: 10000 });
  const finalUrl = page.url();
  await page.screenshot({ path: 'tmp/first-run-smoke-wizard-created-current.png', fullPage: true });
  await browser.close();

  const result = {
    finalUrl,
    habitInsertCount,
    reviewText: reviewText.slice(0, 4000),
    finalText: finalText.slice(0, 5000),
    consoleMessages,
    pageErrors,
    requests,
  };
  fs.writeFileSync('tmp/first-run-smoke-wizard-full-current.json', JSON.stringify(result, null, 2));
  if (pageErrors.length) process.exit(2);
  if (!/Your routine is ready|Enable reminders|Let.s begin|Complete/.test(finalText)) {
    console.error('Post-create screen not reached');
    process.exit(3);
  }
  if (habitInsertCount === 0) {
    console.error('No habit inserts were attempted');
    process.exit(4);
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
