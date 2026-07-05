---
name: verify
description: Build, run, and visually verify the HabbitApp Expo app (web surface) after UI or dashboard/detail changes. Use when a change needs runtime observation, screenshots, or first-run smoke coverage.
---

# Verifying HabbitApp changes (web surface)

## Launch

```bash
npx expo start --web --port 8083   # background; first bundle takes ~1-2 min
# ready when: curl -s -o /dev/null -w "%{http_code}" http://localhost:8083/  → 200
```

Port **8083** is hardcoded in every smoke script. The web app wraps content in a
480px `WebFrame` on desktop viewports.

## Drive it — first-run smokes (Playwright, real UI, mocked Supabase)

Each script fakes a session in localStorage, routes `**/*.supabase.co/**` to
in-memory mocks, drives the real DOM by accessibility role/text, screenshots to
`tmp/first-run-*.png` (gitignored), and dumps text snapshots to
`tmp/first-run-smoke-*.json`.

```bash
node scripts/first-run/detail-log-smoke.cjs    # dashboard hydrate → habit detail → quick log
node scripts/first-run/manual-habit-smoke.cjs  # catalog → form → create → dashboard
node scripts/first-run/desktop-smoke.cjs       # desktop viewport: login, signup, empty dashboard, create
node scripts/first-run/full-smoke.cjs          # wizard routine builder
npm run smoke:first-run                        # all of the above in sequence (needs server up)
```

Selectors the smokes (and dashboard/detail structural tests in
`tests/unit.test.mjs`) depend on — keep these labels/literals working:
`Open {name} details`, `Log +250 ml` (aria-label), `Progress` and `Next`
focus-card labels (`Today's Focus` survives only as the card's
accessibilityLabel + a unit-test source literal), `0 / 2000 ml` progress
label, `TODAY'S TIMELINE`, `Add habit`, `Build my routine`, `Choose manually`.

## Dark mode / custom-data captures

No smoke covers dark theme or reminder-timed habits. Recipe: copy
`detail-log-smoke.cjs`'s `setup()` into a throwaway
`tmp/first-run-<name>-debug.cjs` (that pattern is gitignored) and add to the
init script:

```js
localStorage.setItem("habbit:theme", "dark"); // theme provider reads this key
```

Give a mocked habit `reminder_times: ["07:30"]` to exercise timeline time
labels and the "now" marker. Screenshot with `page.screenshot({ fullPage: true })`.

## Gotchas

- **Pre-existing failure (as of 2026-07-04):** `post-create-smoke.cjs` times out
  waiting for the tutorial/reminder-primer after "Let's begin" — fails
  identically on `main`; not a regression signal for unrelated changes.
- CI-style checks are `npm run typecheck`, `npm test` (node --test, structural
  source-regex assertions), `npm run lint` — they are not runtime verification.
- The pre-commit hook (lint-staged) runs `eslint --fix` + `prettier --write` on
  staged files; diffs may shift slightly at commit time.
