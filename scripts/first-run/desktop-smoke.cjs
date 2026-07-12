const { chromium } = require('playwright');
const fs = require('fs');
const {
  captureStableScreenshot,
  prepareScreenshotPage,
} = require('./screenshot-helper.cjs');

function fakeSession() {
  const userId = '00000000-0000-4000-8000-000000000004';
  const email = 'desktop-first-user-smoke@example.invalid';
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

async function setupDashboard(page, session) {
  const storageKey = 'sb-ehcqgoymkmljwoveisbl-auth-token';
  const onboardingKey = `habbit:onboarding-complete:${session.user.id}`;
  const habits = [];
  let habitInsertCount = 0;

  await page.addInitScript(({ storageKey, onboardingKey, session }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(storageKey, JSON.stringify(session));
    localStorage.setItem(onboardingKey, '1');
  }, { storageKey, onboardingKey, session });

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
    if (path.includes('/rest/v1/feature_flags')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ enabled: false }) });
    if (path.endsWith('/rest/v1/rpc/set_profile_time_zone')) return route.fulfill({ status: 200, headers, body: JSON.stringify('UTC') });
    if (path.includes('/rest/v1/profiles')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ display_name: null, coach_tone: 'friendly', is_pro: false, pro_trial_ends_at: null, revenuecat_entitlement_active: false, pro_expires_at: null }) });
    if (path.includes('/rest/v1/habit_completions')) return route.fulfill({ status: 200, headers, body: req.method() === 'HEAD' ? '' : '[]' });
    if (path.includes('/rest/v1/habits')) {
      if (req.method() === 'GET' || req.method() === 'HEAD') {
        return route.fulfill({ status: 200, headers, body: req.method() === 'HEAD' ? '' : JSON.stringify(habits) });
      }
      if (req.method() === 'POST') {
        habitInsertCount += 1;
        const payload = JSON.parse(req.postData() || '{}');
        const habit = {
          id: `desktop-habit-${habitInsertCount}`,
          user_id: session.user.id,
          name: payload.name || 'Manual Habit',
          description: payload.description || '',
          icon: payload.icon || 'spa',
          color: payload.color || 'primary',
          unit: payload.unit || '',
          target: payload.target ?? null,
          reminders_enabled: payload.reminders_enabled ?? false,
          reminder_times: payload.reminder_times || [],
          reminder_days: payload.reminder_days || [0, 1, 2, 3, 4, 5, 6],
          habit_type: payload.habit_type || 'custom',
          metric_type: payload.metric_type || 'boolean',
          visual_type: payload.visual_type || 'progress_ring',
          reminder_strategy: payload.reminder_strategy || 'manual',
          reminder_interval_minutes: payload.reminder_interval_minutes ?? null,
          default_log_value: payload.default_log_value ?? null,
          archived_at: null,
          created_at: new Date().toISOString(),
        };
        habits.push(habit);
        return route.fulfill({ status: 201, headers, body: JSON.stringify({ id: habit.id }) });
      }
      if (req.method() === 'PATCH') return route.fulfill({ status: 200, headers, body: JSON.stringify([{ id: 'desktop-existing' }]) });
    }
    return route.fulfill({ status: 500, headers, body: JSON.stringify({ message: 'unmocked supabase endpoint', path, method: req.method() }) });
  });

  return { getCounts: () => ({ habitInsertCount, habits }) };
}

async function snapshot(page, label, snapshots) {
  const text = await page.locator('body').innerText({ timeout: 10000 });
  await captureStableScreenshot(page, {
    finalUrl: page.url(),
    target: 'body',
    screenshot: { path: `tmp/first-run-desktop-${label}.png`, fullPage: true },
  });
  snapshots.push({ label, url: page.url(), text: text.slice(0, 3000) });
  if (text.includes('undefined')) throw new Error(`${label} rendered undefined`);
  return text;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  const snapshots = [];

  async function newDesktopPage() {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, isMobile: false });
    await prepareScreenshotPage(page);
    page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
    page.on('pageerror', err => pageErrors.push(String(err.stack || err.message || err)));
    page.on('requestfailed', req => requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? null }));
    return page;
  }

  const authPage = await newDesktopPage();
  await authPage.goto('http://localhost:8083/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await authPage.getByText('Welcome back').waitFor({ timeout: 30000 });
  const loginText = await snapshot(authPage, 'login', snapshots);
  if (!loginText.includes('Email') || !loginText.includes('Sign in')) throw new Error('desktop login did not render core controls');
  await authPage.getByText('Sign up').click();
  await authPage.getByRole('button', { name: 'Create account' }).waitFor({ timeout: 30000 });
  const signupText = await snapshot(authPage, 'signup', snapshots);
  if (!signupText.includes('Confirm Password') || !signupText.includes('Continue with Google')) throw new Error('desktop signup did not render core controls');
  await authPage.close();

  const dashboardPage = await newDesktopPage();
  const harness = await setupDashboard(dashboardPage, fakeSession());
  await dashboardPage.goto('http://localhost:8083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dashboardPage.getByRole('button', { name: 'Add habit' }).waitFor({ timeout: 30000 });
  await dashboardPage.getByRole('button', { name: 'Build my routine' }).waitFor({ timeout: 30000 });
  await dashboardPage.getByRole('button', { name: 'Choose manually' }).waitFor({ timeout: 30000 });
  const emptyText = await snapshot(dashboardPage, 'dashboard-empty', snapshots);
  if (!emptyText.includes('Build your first routine') || !emptyText.includes("TODAY'S TIMELINE")) throw new Error('desktop empty dashboard did not render first-run choices');

  await dashboardPage.getByRole('button', { name: 'Add habit' }).click();
  await dashboardPage.waitForURL(/habits\/new/, { timeout: 15000 });
  await dashboardPage.getByRole('button', { name: /Choose template: Drink Water/ }).waitFor({ timeout: 15000 });
  const catalogText = await snapshot(dashboardPage, 'catalog', snapshots);
  if (!catalogText.includes('Choose a template') || !catalogText.includes('Build custom habit')) throw new Error('desktop catalog did not render habit choices');

  await dashboardPage.getByRole('button', { name: /Choose template: Drink Water/ }).click();
  await dashboardPage.locator('input[value="Drink Water"]').waitFor({ timeout: 10000 });
  const formText = await snapshot(dashboardPage, 'form', snapshots);
  if (!formText.includes('SMART METRIC') || !formText.includes('Create habit')) throw new Error('desktop habit form did not render key controls');

  await dashboardPage.getByRole('button', { name: 'Create habit' }).scrollIntoViewIfNeeded();
  await dashboardPage.getByRole('button', { name: 'Create habit' }).click();
  await dashboardPage.waitForURL('http://localhost:8083/', { timeout: 15000 });
  await dashboardPage.getByText('0 / 2000 ml').waitFor({ timeout: 30000 });
  await dashboardPage.getByRole('button', { name: 'Open Drink Water details' }).waitFor({ timeout: 30000 });
  const createdText = await snapshot(dashboardPage, 'dashboard-created', snapshots);
  await dashboardPage.close();
  await browser.close();

  const result = { counts: harness.getCounts(), snapshots, consoleMessages, pageErrors, requestFailures };
  fs.writeFileSync('tmp/first-run-smoke-desktop-current.json', JSON.stringify(result, null, 2));
  if (pageErrors.length) process.exit(2);
  if (!createdText.includes('Drink Water') || !createdText.includes('0 / 2000 ml')) {
    console.error('desktop manual habit was not visible on dashboard after creation');
    process.exit(3);
  }
  if (harness.getCounts().habitInsertCount !== 1) {
    console.error('expected one desktop manual habit insert');
    process.exit(4);
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
