const { chromium } = require('playwright');
const fs = require('fs');

function fakeSession() {
  const userId = '00000000-0000-4000-8000-000000000003';
  const email = 'detail-first-user-smoke@example.invalid';
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

async function setup(page, session) {
  const storageKey = 'sb-ehcqgoymkmljwoveisbl-auth-token';
  const onboardingKey = `habbit:onboarding-complete:${session.user.id}`;
  const today = '2026-06-21';
  const habit = {
    id: 'detail-habit-1',
    user_id: session.user.id,
    name: 'Drink Water',
    description: 'Stay hydrated throughout the day.',
    icon: 'water_drop',
    color: 'secondary',
    unit: 'ml',
    target: 2000,
    reminders_enabled: true,
    reminder_times: [],
    reminder_days: [0,1,2,3,4,5,6],
    habit_type: 'water_intake',
    metric_type: 'volume_ml',
    visual_type: 'water_bottle',
    reminder_strategy: 'interval',
    reminder_interval_minutes: 120,
    default_log_value: 250,
    archived_at: null,
    created_at: new Date().toISOString(),
  };
  const completionRows = [];
  let completionWriteCount = 0;
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
    if (path.includes('/auth/v1/user')) return route.fulfill({ status: 200, headers, body: JSON.stringify(session.user) });
    if (path.includes('/rest/v1/rpc/get_completion_dates')) return route.fulfill({ status: 200, headers, body: completionRows.length ? JSON.stringify([today]) : '[]' });
    if (path.includes('/rest/v1/rpc/log_habit_completion')) {
      const payload = JSON.parse(req.postData() || '{}');
      const row = {
        id: 'detail-completion-1',
        habit_id: payload.p_habit_id || habit.id,
        user_id: session.user.id,
        completed_on: payload.p_completed_on || today,
        value: payload.p_increment ?? habit.default_log_value,
        note: payload.p_note ?? null,
        created_at: new Date().toISOString(),
      };
      completionWriteCount += 1;
      completionRows.splice(0, completionRows.length, row);
      return route.fulfill({ status: 200, headers, body: 'null' });
    }
    if (path.includes('/rest/v1/feature_flags')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ enabled: false }) });
    if (path.includes('/rest/v1/profiles')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ display_name: null, coach_tone: 'friendly', is_pro: false, pro_trial_ends_at: null, revenuecat_entitlement_active: false, pro_expires_at: null }) });
    if (path.includes('/rest/v1/habit_completions')) {
      if (req.method() === 'POST' || req.method() === 'PATCH') {
        const payload = JSON.parse(req.postData() || '{}');
        const row = {
          id: 'detail-completion-1',
          habit_id: payload.habit_id || habit.id,
          user_id: session.user.id,
          completed_on: payload.completed_on || today,
          value: payload.value ?? habit.default_log_value,
          note: payload.note ?? null,
          created_at: new Date().toISOString(),
        };
        completionWriteCount += 1;
        completionRows.splice(0, completionRows.length, row);
        return route.fulfill({ status: 201, headers, body: JSON.stringify([row]) });
      }
      return route.fulfill({ status: 200, headers, body: req.method() === 'HEAD' ? '' : JSON.stringify(completionRows) });
    }
    if (path.includes('/rest/v1/habits')) {
      if (req.method() === 'GET' || req.method() === 'HEAD') {
        const isSingleHabitFetch = url.searchParams.get('id') === `eq.${habit.id}`;
        const body = isSingleHabitFetch ? JSON.stringify(habit) : JSON.stringify([habit]);
        return route.fulfill({ status: 200, headers, body: req.method() === 'HEAD' ? '' : body });
      }
    }
    return route.fulfill({ status: 500, headers, body: JSON.stringify({ message: 'unmocked supabase endpoint', path, method: req.method() }) });
  });
  return { getCounts: () => ({ completionWriteCount, completionRows }) };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(String(err.stack || err.message || err)));
  page.on('requestfailed', req => requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? null }));
  const harness = await setup(page, fakeSession());
  const snapshots = [];
  async function snap(label) {
    const text = await page.locator('body').innerText({ timeout: 10000 });
    await page.screenshot({ path: `tmp/first-run-detail-${label}.png`, fullPage: true });
    snapshots.push({ label, url: page.url(), text: text.slice(0, 3000) });
    return text;
  }

  await page.goto('http://localhost:8083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: 'Open Drink Water details' }).waitFor({ timeout: 30000 });
  const dashboardText = await snap('dashboard');
  if (!dashboardText.includes('Drink Water') || !dashboardText.includes("Today's Focus")) {
    throw new Error('dashboard did not hydrate before detail navigation');
  }
  await page.getByRole('button', { name: 'Open Drink Water details' }).click();
  await page.waitForURL(/habits\/detail-habit-1/, { timeout: 15000 });
  const detailText = await snap('detail-before-log');
  if (!detailText.includes('Drink Water') || detailText.includes('undefined') || !detailText.includes('0 / 2000 ml')) {
    throw new Error('detail screen did not show initial water progress');
  }
  const quickLog = page.locator('[aria-label="Log +250 ml"]');
  await quickLog.scrollIntoViewIfNeeded();
  const quickLogBox = await quickLog.boundingBox();
  if (!quickLogBox) throw new Error('quick log button was not visible');
  await quickLog.tap({ force: true });
  await page.waitForTimeout(2200);
  const afterLogText = await snap('detail-after-log');
  await browser.close();
  const result = { counts: harness.getCounts(), snapshots, consoleMessages, pageErrors, requestFailures };
  fs.writeFileSync('tmp/first-run-smoke-detail-current.json', JSON.stringify(result, null, 2));
  if (pageErrors.length) process.exit(2);
  if (!afterLogText.includes('250 / 2000 ml')) {
    console.error('detail progress did not update after quick log');
    process.exit(3);
  }
  if (harness.getCounts().completionWriteCount !== 1) {
    console.error('expected one completion write from detail quick log');
    process.exit(4);
  }
})().catch(err => { console.error(err); process.exit(1); });
