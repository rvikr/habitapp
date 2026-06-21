const { chromium } = require('playwright');
const fs = require('fs');

function fakeSession() {
  const userId = '00000000-0000-4000-8000-000000000001';
  const email = 'first-user-smoke@example.invalid';
  const now = Math.floor(Date.now() / 1000);
  return { access_token: 'fake-access-token', refresh_token: 'fake-refresh-token', expires_in: 3600, expires_at: now + 3600, token_type: 'bearer', user: { id: userId, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [{ id: userId, user_id: userId, provider: 'email', identity_data: { email, sub: userId } }], created_at: new Date().toISOString(), updated_at: new Date().toISOString() } };
}

async function setup(page, session) {
  const storageKey = 'sb-ehcqgoymkmljwoveisbl-auth-token';
  let habitInsertCount = 0;
  let completionLogCount = 0;
  const today = '2026-06-21';
  const createdHabits = [];
  const completionRows = [];
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
    if (path.includes('/rest/v1/rpc/get_completion_dates')) return route.fulfill({ status: 200, headers, body: completionRows.length > 0 ? JSON.stringify([today]) : '[]' });
    if (path.includes('/rest/v1/rpc/log_habit_completion')) { completionLogCount += 1; return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) }); }
    if (path.includes('/rest/v1/feature_flags')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ enabled: false }) });
    if (path.includes('/rest/v1/profiles')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ display_name: null, coach_tone: 'friendly', is_pro: false, pro_trial_ends_at: null, revenuecat_entitlement_active: false, pro_expires_at: null }) });
    if (path.includes('/rest/v1/habit_completions')) {
      if (req.method() === 'POST' || req.method() === 'PATCH') {
        const payload = JSON.parse(req.postData() || '{}');
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          completionLogCount += 1;
          const habitId = row.habit_id || 'mock-habit-1';
          const existingIndex = completionRows.findIndex(item => item.habit_id === habitId && item.completed_on === (row.completed_on || today));
          const normalized = {
            habit_id: habitId,
            completed_on: row.completed_on || today,
            created_at: new Date().toISOString(),
            value: row.value ?? null,
          };
          if (existingIndex >= 0) completionRows[existingIndex] = normalized;
          else completionRows.push(normalized);
        }
        return route.fulfill({ status: 201, headers, body: JSON.stringify(completionRows) });
      }
      return route.fulfill({ status: 200, headers, body: req.method() === 'HEAD' ? '' : JSON.stringify(completionRows) });
    }
    if (path.includes('/rest/v1/habits')) {
      if (req.method() === 'GET' || req.method() === 'HEAD') {
        const rows = habitInsertCount > 0 ? createdHabits : [];
        return route.fulfill({ status: 200, headers, body: req.method() === 'HEAD' ? '' : JSON.stringify(rows) });
      }
      if (req.method() === 'POST') {
        habitInsertCount += 1;
        const payload = JSON.parse(req.postData() || '{}');
        const habit = {
          id: `mock-habit-${habitInsertCount}`,
          user_id: session.user.id,
          name: payload.name || `Mock Habit ${habitInsertCount}`,
          description: payload.description || '',
          icon: payload.icon || 'check_circle',
          color: payload.color || 'primary',
          unit: payload.unit || 'times',
          target: payload.target || 1,
          reminders_enabled: payload.reminders_enabled ?? true,
          reminder_times: payload.reminder_times || [],
          reminder_days: payload.reminder_days || [0,1,2,3,4,5,6],
          habit_type: payload.habit_type || 'custom',
          metric_type: payload.metric_type || 'count',
          visual_type: payload.visual_type || 'progress_ring',
          reminder_strategy: payload.reminder_strategy || 'manual',
          reminder_interval_minutes: payload.reminder_interval_minutes ?? null,
          default_log_value: payload.default_log_value ?? payload.target ?? 1,
          archived_at: null,
          created_at: new Date().toISOString(),
        };
        createdHabits.push(habit);
        return route.fulfill({ status: 201, headers, body: JSON.stringify(habit) });
      }
      if (req.method() === 'PATCH') return route.fulfill({ status: 200, headers, body: JSON.stringify([{ id: 'mock-habit-existing' }]) });
    }
    return route.fulfill({ status: 500, headers, body: JSON.stringify({ message: 'unmocked supabase endpoint', path, method: req.method() }) });
  });
  return { getCounts: () => ({ habitInsertCount, completionLogCount }) };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
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
    await page.screenshot({ path: `tmp/first-run-post-${label}.png`, fullPage: true });
    snapshots.push({ label, url: page.url(), text: text.slice(0, 3000) });
    return text;
  }

  await page.goto('http://localhost:8083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForURL(/habits\/wizard/, { timeout: 15000 });
  await page.getByText('Energy').click();
  for (let i = 0; i < 7; i += 1) await page.getByText('Next').click();
  await page.getByText('Build routine').click();
  await page.getByText('Create routine').waitFor({ timeout: 30000 });
  await page.getByText('Create routine').click();
  await page.getByText('Your routine is ready').waitFor({ timeout: 30000 });
  await snap('confirm');
  await page.getByText("Let's begin").click();
  await page.getByText(/Let's complete your first habit together|Enable reminders/).waitFor({ timeout: 30000 });
  const afterBegin = await snap('after-begin');
  if (/Enable reminders|Maybe later|Continue/.test(afterBegin)) {
    const maybe = page.getByText(/Maybe later|Continue/).last();
    await maybe.click({ timeout: 10000 });
    await page.getByText("Let's complete your first habit together").waitFor({ timeout: 30000 });
    await snap('after-reminder-primer');
  }
  const tutorialText = await page.locator('body').innerText({ timeout: 10000 });
  if (tutorialText.includes('Complete')) {
    await page.getByRole('button', { name: 'Complete' }).click();
    await page.getByText('2000 / 2000 ml').waitFor({ timeout: 30000 });
    await snap('after-complete');
  } else if (tutorialText.includes('Skip for now')) {
    await page.getByText('Skip for now').click();
    await page.getByText(/TODAY'S HABITS|Build your first routine/).waitFor({ timeout: 30000 });
    await snap('after-skip');
  }
  await browser.close();
  const result = { counts: harness.getCounts(), snapshots, consoleMessages, pageErrors, requestFailures };
  fs.writeFileSync('tmp/first-run-smoke-post-create-current.json', JSON.stringify(result, null, 2));
  if (pageErrors.length) process.exit(2);
  const final = snapshots[snapshots.length - 1]?.text ?? '';
  if (!/Hey,|TODAY'S HABITS|Welcome to Lagan|Build your first routine|Drink Water/.test(final)) {
    console.error('Did not reach dashboard-like final state');
    process.exit(3);
  }
  if (!/1 of 4 done|1 of 4 habits completed today/.test(final)) {
    console.error('Expected dashboard to preserve first completed habit after tutorial');
    process.exit(4);
  }
})().catch(err => { console.error(err); process.exit(1); });

