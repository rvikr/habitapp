const https = require('https');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function envFromEas(name) {
  if (!existsSync('eas.json')) return null;
  const eas = readJson('eas.json');
  for (const profileName of ['preview', 'production', 'development']) {
    const value = eas.build?.[profileName]?.env?.[name];
    if (value) return value;
  }
  return null;
}

function requiredConfig(name) {
  const value = process.env[name] || envFromEas(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function formatError(error) {
  if (error instanceof Error) {
    const parts = [error.message, error.name, error.code].filter(Boolean);
    if (Array.isArray(error.errors)) {
      for (const child of error.errors) {
        if (child?.message || child?.code) {
          parts.push(`${child.code ?? child.name ?? 'cause'} ${child.message ?? ''}`.trim());
        }
      }
    }
    return parts.length > 0 ? parts.join(' | ') : String(error);
  }
  return String(error);
}

function requestJson(url, anonKey) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
        },
        timeout: 15000,
      },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = body ? JSON.parse(body) : null;
          } catch {
            parsed = { raw: body.slice(0, 200) };
          }
          resolve({ statusCode: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timed out requesting ${url}`));
    });
  });
}

function settingValue(settings, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(settings, name)) return settings[name];
  }
  return null;
}

(async () => {
  const supabaseUrl = requiredConfig('EXPO_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = requiredConfig('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const googleClientId = requiredConfig('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
  const settingsUrl = `${supabaseUrl}/auth/v1/settings`;
  const settings = await requestJson(settingsUrl, anonKey);
  const pendingManualGates = [
    'Live signup: create a new account, receive the confirmation email, open the link, and land in app.',
    'Live password recovery: request reset, open reset email, set password, and sign in.',
    'Live Google sign-in: complete OAuth on web with the configured Supabase redirect URL.',
  ];

  console.log('\n[first-run live-web] Supabase auth settings');
  console.log(`URL ${settingsUrl}`);
  console.log(`HTTP ${settings.statusCode}`);

  if (settings.statusCode < 200 || settings.statusCode >= 300) {
    console.error(JSON.stringify(settings.body, null, 2));
    throw new Error('Supabase auth settings endpoint did not return 2xx');
  }

  const externalProviders =
    settings.body?.external ??
    settings.body?.external_providers ??
    settings.body?.providers ??
    {};
  const googleEnabled =
    externalProviders.google === true ||
    externalProviders.google?.enabled === true ||
    settings.body?.google === true;
  const authSettingsSummary = {
    publicKeys: Object.keys(settings.body ?? {}).sort(),
    signupDisabled: settingValue(settings.body ?? {}, ['disable_signup', 'signup_disabled']),
    emailAutoconfirm: settingValue(settings.body ?? {}, ['mailer_autoconfirm', 'email_autoconfirm']),
    externalProviderKeys: Object.keys(externalProviders ?? {}).sort(),
  };

  console.log(`Google web client id configured: ${googleClientId ? 'yes' : 'no'}`);
  console.log(`Google provider advertised by Supabase settings: ${googleEnabled ? 'yes' : 'unknown'}`);
  console.log(
    `Signup disabled setting: ${
      authSettingsSummary.signupDisabled === null ? 'not advertised' : authSettingsSummary.signupDisabled
    }`,
  );
  console.log(
    `Email autoconfirm setting: ${
      authSettingsSummary.emailAutoconfirm === null ? 'not advertised' : authSettingsSummary.emailAutoconfirm
    }`,
  );

  mkdirSync('tmp', { recursive: true });
  writeFileSync(
    'tmp/first-run-live-web-current.json',
    `${JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        settingsUrl,
        statusCode: settings.statusCode,
        googleWebClientIdConfigured: Boolean(googleClientId),
        googleProviderAdvertised: googleEnabled ? true : 'unknown',
        authSettingsSummary,
        pendingManualGates,
      },
      null,
      2,
    )}\n`,
  );
  console.log('Artifact tmp/first-run-live-web-current.json');

  console.log('\n[first-run live-web] manual proof still required');
  for (const gate of pendingManualGates) console.log(`TODO ${gate}`);
})().catch(error => {
  console.error(`\n[first-run live-web] ${formatError(error)}`);
  process.exit(1);
});
