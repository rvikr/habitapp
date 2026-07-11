# Contributing

Thanks for working on HabbitApp. This doc covers the dev loop, code conventions, and the commit-message format the repo enforces.

## Local development

```sh
npm install            # also wires up the git hooks via husky
cp .env.local.example .env.local
# fill in Supabase + optional Sentry/PostHog keys

npm start              # Expo dev server (scan QR with Expo Go)
npm run web            # browser at http://localhost:8081
npm run android        # native Android
npm run ios            # native iOS
```

## Before opening a PR

Run all three locally — CI runs the same commands and will fail the PR otherwise:

```sh
npm run typecheck
npm run lint
npm test
```

If the change is user-visible, also update [QA.md](QA.md) so the manual test pass stays accurate.

### Website checks

Changes that affect the landing site, shared navigation, or the admin feature-flag screen also
require the website gate:

```sh
node --test website/tests/landing-page-content.test.mjs
npm --prefix website run typecheck
npm --prefix website run lint
npm --prefix website run build
```

### Activation v2 checks

Start Expo web on port 8083 in one terminal, then run the activation smokes in another:

```sh
npx expo start --web --port 8083

# Separate terminal
npm run smoke:first-run
npm run smoke:treatment-quick-start
npm run smoke:treatment-manual
node scripts/first-run/activation-dashboard-smoke.cjs
node --test tests/screenshot-helper.test.mjs
```

The aggregate smoke covers the control eight-step routine, treatment three-step routine, shared
first log, manual creation, authentication, callback states, and later regression scenarios. Do
not stop after the first passing scenario. Use the stage-specific dashboard smoke to cover
pre-value, first-log, engaged, and hidden-route redirects.

### Supabase migrations

Follow the official [database migration workflow](https://supabase.com/docs/guides/deployment/database-migrations).
Create migration filenames through the CLI, never by hand:

```sh
supabase --version
supabase migration new descriptive_change_name
```

Docker must be running for local verification. Before opening a PR with database changes, rebuild
the local database from migration history and verify the migration, pgTAP contract, and advisors:

```sh
supabase start
supabase db reset --local
supabase migration list --local
supabase test db supabase/tests/database/activation_v2.test.sql
supabase test db supabase/tests/database/completion_increment_idempotency.test.sql
supabase db advisors --local --type all --fail-on error
```

Review the official [database-function security guidance](https://supabase.com/docs/guides/database/functions)
whenever a migration adds a trigger or privileged function: keep private functions out of exposed
schemas, pin `search_path`, validate ownership, and revoke unneeded execution. Do not alter the
linked production database directly. Deploy activation-v2's migration first with the flag disabled
at `0%`; enable staging and production rollout only after the migration and smoke evidence pass.

### Analytics privacy

Activation analytics may identify an authenticated user with the Supabase UUID only. Event
properties and screen paths must never contain email, callback/authentication URLs or codes, habit
names or IDs, body metrics, baselines, wizard answers, or raw error messages. Use categorized
failures and the shared cohort/platform properties, and instrument control and treatment with the
same schema. Add a regression test whenever a new event or property is introduced.

### Screenshot proof

Use `scripts/first-run/screenshot-helper.cjs` for success and review evidence. Apply reduced motion
before navigation, provide the expected final URL and a locator for the element that proves the
state, then call `captureStableScreenshot`. The helper waits for target visibility,
`document.fonts.ready`, and stable target bounds across animation frames before capture.

```js
const { navigateAndCaptureStableScreenshot } = require("./screenshot-helper.cjs");

await navigateAndCaptureStableScreenshot(page, {
  url: "http://localhost:8083/habits/wizard",
  finalUrl: /\/habits\/wizard$/,
  target: page.getByText("Create routine", { exact: true }),
  screenshot: { path: "tmp/routine-review.png", fullPage: true },
});
```

Do not use fixed sleeps as evidence that a page is ready. A raw immediate screenshot is allowed in
an error handler because its purpose is to preserve the failure state. Keep generated images and
JSON in ignored `tmp/` paths rather than committing them.

## Commit messages

The `commit-msg` hook enforces a Conventional Commits subset on the subject line:

```
<type>(optional-scope): <description>
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`.

Examples:

```
feat(coach): add burnout detection signal
fix(streak): correct off-by-one across DST boundary
docs(readme): document Cloud Run deployment
chore(deps): bump expo to 54.0.13
refactor(lib): group platform adapters under lib/platform
```

Merge commits, reverts, and `fixup!`/`squash!` autosquash messages are exempt.

## Code style

- TypeScript strict mode is on; new code should typecheck without `// @ts-ignore`.
- ESLint + Prettier run on every commit via `lint-staged`. Don't fight the formatter — `npm run format` cleans the whole tree.
- Prefer editing existing files in [lib/](lib/) and [components/](components/) over creating new top-level modules.

## Release process

See [SHIPPING.md](SHIPPING.md) for the launch checklist and EAS / Cloud Run deployment steps.
