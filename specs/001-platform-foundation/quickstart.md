# Foundation validation

From a clean checkout, activate Node 24 and install locked dependencies:

```sh
npm ci
npm run check:docs
npm run typecheck
npm run build:check
SPECIFY_FEATURE_DIRECTORY=specs/001-platform-foundation \
  .specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks
git diff --check
git check-ignore .env.local .eve/provider.json node_modules .output tmp
```

Expected: documentation check reports its file count; typecheck and compile succeed;
Spec Kit resolves the foundation spec/plan/tasks; diff check is clean; local secret,
runtime, dependency and generated-output paths are ignored. `build:check` deliberately
skips sandbox preparation and is not a deployment-readiness test.

Install the pinned CLI if using interactive Spec Kit commands (not required for
the checked-in Bash prerequisite check):

```sh
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.0.12
specify version
```

Review [spec](spec.md), [roadmap](../../ROADMAP.md) and the blueprint to confirm all
requested capabilities have an owner slice and exit criteria. Inspect
`git diff --cached --name-only` before committing. Ensure `.env.local`, `.eve`,
`.vercel`, `.output`, `node_modules`, local artifacts and credentials are absent.

CI runs the same structural/type/compile checks on Node 24 without customer secrets.
No live model eval, web UI test, database test or deployment is implied by this pass.
The foundation PR must state those limits. Future UI validation runs through
command-line Playwright/WebKit with synthetic fixtures, not the host browser.
