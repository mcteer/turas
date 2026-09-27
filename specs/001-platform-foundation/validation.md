# Foundation validation record

Date: 2026-09-26 (America/Denver). Environment: local macOS, Node 24.21.0,
Specify CLI 1.0.12, existing locked dependencies. No customer data was used in tests.

| Check | Result |
| --- | --- |
| Official pinned Specify install and version | Passed; project-local skills, templates, scripts, workflow and manifests present |
| `npm ci` on Node 24 | Passed; locked installation, audit reported zero vulnerabilities |
| `npm run check:docs` | Passed; authored relative-link targets and tracked-path hygiene |
| `npm run typecheck` on Node 24 | Passed |
| `npm run build:check` on Node 24 | Passed; sandbox preparation intentionally skipped |
| Spec Kit `check-prerequisites.sh --json --require-spec --require-tasks` | Passed; correct foundation directory and design artifacts resolved |
| `git diff --cached --check` | Passed |
| Ignore and staged-path review | `.env.local`, `.eve`, `.vercel`, dependencies, build output and local artifacts excluded |
| Local secret-value comparison against staged contents | Passed; secret values were not printed |
| Cross-artifact and requirement coverage | Passed; see `analysis.md` and `checklists/requirements.md` |
| GitHub Actions foundation job | Passed on initial PR commit; subsequent runs are visible on the PR |
| Existing Vercel automatic preview | Failed: linked project expects Next.js, which this eve-only foundation does not install |

## Limits and observations

The initial full `npm run build` attempt waited at sandbox template preparation and
was stopped. The documented compile-only path then passed. It emits an upstream
bundler diagnostic about a code-splitting timing-group debug name; compilation still
completes successfully. This does not validate sandbox startup or deployment.

No UI is built in this slice, so no Playwright/WebKit suite ran. Future UI testing
uses the CLI. No live model evaluation, customer database test, report delivery,
MCP test or hosted runtime verification ran. Agent instructions were reviewed for
truthful capability boundaries; model response behavior was not evaluated live.

[Foundation PR #1](https://github.com/mcteer/turas/pull/1) is open for review.
Maintainer review, merge and README verification on merged `main` remain the handoff steps.

The existing Git-connected Vercel project automatically attempted a preview on push.
Read-only inspection found `No Next.js version detected` before the application build:
the linked project's framework setting still expects the demo's Next.js dependency.
No manual deployment, project setting change or integration installation was performed
to work around this. Align the project with the real web shell in 002 (D18), before
treating preview/deployment as a release gate. The passing foundation job does not
make the separate Vercel status green.
