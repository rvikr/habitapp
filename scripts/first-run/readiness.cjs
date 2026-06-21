const { spawnSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function commandExists(command) {
  const lookup = process.platform === 'win32' ? 'where.exe' : 'command';
  const args = process.platform === 'win32' ? [command] : ['-v', command];
  const result = spawnSync(lookup, args, { encoding: 'utf8', shell: false });
  return result.status === 0;
}

function hasEnvValue(name, eas) {
  if (process.env[name]) return true;
  for (const profile of Object.values(eas.build ?? {})) {
    if (profile?.env?.[name]) return true;
  }
  return false;
}

function add(results, ok, label, detail) {
  results.push({ ok, label, detail });
}

const app = readJson('app.json').expo;
const eas = existsSync('eas.json') ? readJson('eas.json') : { build: {} };
const results = [];
const skipNativeInstall = process.argv.includes('--skip-native-install');
const webOnly = process.argv.includes('--web-only');

add(results, commandExists('npx') || commandExists('npx.cmd'), 'npx is available', 'Needed for Expo and EAS commands.');
if (!webOnly) {
  add(results, commandExists('adb'), 'adb is available', 'Needed for Android emulator/device QA.');
  add(
    results,
    commandExists('eas-cli') || commandExists('eas-cli.cmd'),
    'eas-cli is available',
    'Needed for preview/production native builds. Install or run through a prepared npx cache before release QA.',
  );
} else {
  add(results, true, 'native tooling checks skipped for web-only readiness', '--web-only');
}

for (const name of [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
]) {
  add(results, hasEnvValue(name, eas), `${name} configured`, 'Checked local env and EAS build profile env values.');
}

const redirectUrl = `${app.scheme}://auth/callback`;
add(results, redirectUrl === 'lagan://auth/callback', 'native auth redirect is lagan://auth/callback', redirectUrl);
add(results, app.android?.package === 'health.lagan.app', 'Android package is health.lagan.app', app.android?.package);
add(results, app.ios?.bundleIdentifier === 'health.lagan.app', 'iOS bundle id is health.lagan.app', app.ios?.bundleIdentifier);
add(
  results,
  (app.android?.permissions ?? []).includes('android.permission.POST_NOTIFICATIONS'),
  'Android POST_NOTIFICATIONS permission is declared',
  (app.android?.permissions ?? []).join(', '),
);

let failures = 0;
console.log('\n[first-run readiness] local prerequisite check');
for (const result of results) {
  const marker = result.ok ? 'PASS' : 'FAIL';
  if (!result.ok) failures += 1;
  console.log(`${marker} ${result.label}`);
  if (result.detail) console.log(`     ${result.detail}`);
}

console.log('\n[first-run readiness] manual evidence still required');
const manualGates = [
  'Live email signup: real Supabase confirmation email opens the app and clears pending signup state.',
  'Live password recovery: real reset email opens the reset screen and the new password signs in.',
  webOnly
    ? 'Live Google sign-in: OAuth completes on web with the configured Supabase redirect URL.'
    : 'Live Google sign-in: OAuth completes on web, Android, and iOS with lagan://auth/callback allowed in Supabase.',
];

if (!webOnly) {
  manualGates.push(
    'Native notifications: permission prompt appears, a one-minute reminder fires, tapping opens the app, disabling cancels.',
  );
}

if (!skipNativeInstall) {
  manualGates.splice(
    3,
    0,
    'Android first install: fresh install creates/logs the first habit, survives restart, and signs out cleanly.',
    'iOS first install: fresh install creates/logs the first habit, survives restart, and signs out cleanly.',
  );
} else {
  console.log('SKIP Android/iOS first-install gates skipped for this assessment by --skip-native-install.');
}

for (const gate of manualGates) {
  console.log(`TODO ${gate}`);
}

if (failures > 0) {
  console.error(`\n[first-run readiness] ${failures} prerequisite check(s) failed.`);
  process.exit(1);
}

console.log('\n[first-run readiness] prerequisites are present; run the manual gates in QA.md next.');
