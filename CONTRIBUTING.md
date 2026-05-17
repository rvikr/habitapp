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
