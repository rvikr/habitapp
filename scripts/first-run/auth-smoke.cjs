const { chromium } = require('playwright');
const fs = require('fs');

async function snapshot(page, label, snapshots) {
  const text = await page.locator('body').innerText({ timeout: 10000 });
  await page.screenshot({ path: `tmp/first-run-auth-${label}.png`, fullPage: true });
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
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  const passwordResetCalls = [];
  const signupCalls = [];
  const unexpectedBackendCalls = [];
  const snapshots = [];

  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(String(err.stack || err.message || err)));
  page.on('requestfailed', req => requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? null }));
  await page.route('**/*.supabase.co/**', route => {
    const req = route.request();
    const url = new URL(req.url());
    const call = { method: req.method(), url: req.url() };
    if (req.method() === 'POST' && url.pathname.includes('/auth/v1/recover')) {
      passwordResetCalls.push(call);
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify({}),
      });
    }
    if (req.method() === 'POST' && url.pathname.includes('/auth/v1/signup')) {
      const body = JSON.parse(req.postData() || '{}');
      const userId = '00000000-0000-4000-8000-000000000099';
      signupCalls.push({ ...call, body });
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          user: {
            id: userId,
            aud: 'authenticated',
            role: 'authenticated',
            email: body.email,
            app_metadata: { provider: 'email', providers: ['email'] },
            user_metadata: {},
            identities: [{ id: userId, user_id: userId, provider: 'email', identity_data: { email: body.email, sub: userId } }],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          session: null,
        }),
      });
    }
    unexpectedBackendCalls.push(call);
    return route.fulfill({
      status: 500,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ message: 'auth smoke should not hit backend during local validation' }),
    });
  });

  await page.goto('http://localhost:8083/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText('Welcome back').waitFor({ timeout: 30000 });
  const loginText = await snapshot(page, 'login', snapshots);
  for (const expected of ['Lagan', 'Email', 'Password', 'Forgot password?', 'Sign in', 'Continue with Google', 'Sign up']) {
    if (!loginText.includes(expected)) throw new Error(`login missing ${expected}`);
  }

  await page.getByText('Forgot password?').click();
  await page.getByText('Reset password').waitFor({ timeout: 10000 });
  const forgotText = await snapshot(page, 'forgot-password', snapshots);
  for (const expected of ['Reset password', "We'll email you a link to set a new password.", 'Send reset link', 'Cancel']) {
    if (!forgotText.includes(expected)) throw new Error(`forgot password modal missing ${expected}`);
  }
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByText('Email is required.').waitFor({ timeout: 10000 });
  const forgotRequiredText = await snapshot(page, 'forgot-password-required', snapshots);
  if (!forgotRequiredText.includes('Email is required.')) {
    throw new Error('forgot password empty-email validation did not render');
  }
  await page.locator('input').last().fill('not-an-email');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByText('Enter a valid email address.').waitFor({ timeout: 10000 });
  const forgotInvalidText = await snapshot(page, 'forgot-password-invalid', snapshots);
  if (!forgotInvalidText.includes('Enter a valid email address.')) {
    throw new Error('forgot password invalid-email validation did not render');
  }
  if (passwordResetCalls.length || unexpectedBackendCalls.length) {
    throw new Error('forgot password local validation contacted backend before a valid email');
  }
  await page.locator('input').last().fill('first-user-reset-smoke@example.invalid');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByText('Reset link sent. Check your email.').waitFor({ timeout: 10000 });
  const forgotSuccessText = await snapshot(page, 'forgot-password-success', snapshots);
  if (!forgotSuccessText.includes('Reset link sent. Check your email.')) {
    throw new Error('forgot password success copy did not render');
  }
  if (passwordResetCalls.length !== 1 || unexpectedBackendCalls.length) {
    throw new Error('forgot password reset should make exactly one recover call and no other backend calls');
  }
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByText('Reset password').waitFor({ state: 'hidden', timeout: 10000 });

  await page.getByText('Sign up').click();
  await page.getByRole('button', { name: 'Create account' }).waitFor({ timeout: 10000 });
  const signupText = await snapshot(page, 'signup', snapshots);
  if (signupText.includes('Reset password')) {
    throw new Error('signup screen captured with forgot password modal still visible');
  }
  for (const expected of ['Create account', 'Email', 'Password', 'Confirm Password', 'Continue with Google', 'Sign in']) {
    if (!signupText.includes(expected)) throw new Error(`signup missing ${expected}`);
  }

  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Email and password are required.').waitFor({ timeout: 10000 });
  const validationText = await snapshot(page, 'signup-validation', snapshots);
  if (!validationText.includes('Email and password are required.')) {
    throw new Error('English empty signup validation did not render');
  }

  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByRole('button', { name: 'अकाउंट बनाएं' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'अकाउंट बनाएं' }).click();
  await page.getByText('ईमेल और पासवर्ड जरूरी हैं.').waitFor({ timeout: 10000 });
  const hindiRequiredText = await snapshot(page, 'hindi-required-validation', snapshots);
  if (!hindiRequiredText.includes('ईमेल और पासवर्ड जरूरी हैं.')) {
    throw new Error('Hindi empty signup validation did not render');
  }

  const inputs = page.locator('input');
  await inputs.nth(0).fill('first-user-auth-smoke@example.invalid');
  await inputs.nth(1).fill('short');
  await inputs.nth(2).fill('short');
  await page.getByRole('button', { name: 'अकाउंट बनाएं' }).click();
  await page.getByText('पासवर्ड कम से कम 8 अक्षरों का होना चाहिए.').waitFor({ timeout: 10000 });
  const hindiPasswordText = await snapshot(page, 'hindi-password-validation', snapshots);
  if (!hindiPasswordText.includes('पासवर्ड कम से कम 8 अक्षरों का होना चाहिए.')) {
    throw new Error('Hindi password validation did not render');
  }

  await inputs.nth(0).fill('first-user-signup-smoke@example.invalid');
  await inputs.nth(1).fill('StrongPass1');
  await inputs.nth(2).fill('StrongPass1');
  await page.getByRole('button', { name: 'अकाउंट बनाएं' }).click();
  await page.getByText('अकाउंट बन गया. पुष्टि के लिए अपना ईमेल देखें, फिर यहां आकर साइन इन करें.').waitFor({ timeout: 10000 });
  const signupSuccessText = await snapshot(page, 'hindi-signup-success', snapshots);
  if (!signupSuccessText.includes('अकाउंट बन गया. पुष्टि के लिए अपना ईमेल देखें, फिर यहां आकर साइन इन करें.')) {
    throw new Error('Hindi signup success confirmation did not render');
  }
  if (signupCalls.length !== 1) {
    throw new Error('successful signup should make exactly one signup call');
  }
  if (signupCalls[0].body.email !== 'first-user-signup-smoke@example.invalid' || signupCalls[0].body.password !== 'StrongPass1') {
    throw new Error('signup call did not include the expected first-user email and password');
  }

  await browser.close();

  const result = { snapshots, consoleMessages, pageErrors, requestFailures, passwordResetCalls, signupCalls, unexpectedBackendCalls };
  fs.writeFileSync('tmp/first-run-smoke-auth-current.json', JSON.stringify(result, null, 2));
  if (pageErrors.length) process.exit(2);
  if (unexpectedBackendCalls.length) {
    console.error('auth validation smoke unexpectedly contacted backend outside password recovery');
    process.exit(3);
  }
})().catch(async err => {
  console.error(err);
  process.exit(1);
});
