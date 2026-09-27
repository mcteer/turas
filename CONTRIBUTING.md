# Contributing to Turas

Humans and coding agents use the same review and validation process. Start with
the [constitution](.specify/memory/constitution.md), [roadmap](ROADMAP.md), and
active specification. The demo is a reference, never an implicit source of truth.

## Set up

Use Node 24 and `npm ci`. Keep credentials in ignored `.env.local`; read
[README](README.md) before running anything that calls a live service. Install
the pinned Specify CLI as documented there. A normal checkout already contains
templates and agent skills; do not rerun initialization over project policy.

## Feature workflow

1. Select one roadmap slice whose prerequisites have passed. Create a branch
   `NNN-short-name` from current `main` using ordinary Git. Confirm the number
   is not already assigned to another spec or branch.
2. Use `$speckit-specify` to describe the user outcome and acceptance scenarios.
   Use the matching numbered directory in `specs/`. Set
   `SPECIFY_FEATURE_DIRECTORY=specs/NNN-short-name` when resuming it.
3. Resolve consequential ambiguities with `$speckit-clarify`. Record assumptions,
   non-goals, and decision owners. Do not block unrelated work on a later choice.
4. Run `$speckit-plan` and `$speckit-tasks`. Include contracts, data lifecycle,
   dependencies, required tests, and rollout/rollback for changed behavior.
5. Run `$speckit-analyze`; resolve critical gaps before `$speckit-implement`.
   Select a coding model appropriate to the work without changing Turi's runtime
   model as a side effect. Keep each PR small enough for focused review.
6. Run relevant checks and `$speckit-converge` when useful. Mark tasks complete
   only with evidence. Document skipped or unavailable checks and their impact.
7. Open a PR using the template, link the spec, and explain resulting behavior.
   Obtain maintainer review, address comments, and merge after checks pass. Do not
   bypass protection or self-report an independent review that did not occur.

For a narrow bug fix, reference the governing spec and add a regression test when
behavior warrants it. Documentation and cosmetic fixes can use `docs/` or `fix/`
branches and do not need a new full spec. Use Conventional Commit subjects such as
`feat(context): add reviewed claim revisions` or `docs: clarify evidence age policy`.
Squash merges are the default recommendation, not a configured repository setting.

Do not attribute authorship to a coding harness in commits, PRs, reports, or authored
project documentation. Do not add harness co-author trailers, bylines, or generated-by
notices. Tool names may appear where necessary for setup/configuration. Preserve
upstream tooling's required license and provenance metadata.

## Engineering standards

- Prefer small, typed modules with explicit inputs/outputs. Validate untrusted
  boundaries; keep secrets and privileged operations server-side. Avoid `any`
  and broad exception swallowing; distinguish denied, unavailable, empty, and failed.
- Separate domain policy from transport and presentation. Reuse domain services
  across UI, tools, schedules, and MCP instead of duplicating authorization logic.
- Build accessible interfaces: semantic controls, keyboard access, focus handling,
  readable contrast, responsive layouts, and useful empty/error/loading states.
- Use explicit transactions, concurrency/version checks, idempotency keys, and
  bounded retries for writes. Never retry ambiguous sends without reconciliation.
- Apply least privilege, input limits, source validation, prompt-injection defense,
  dependency review, safe logging, and environment separation. Do not add sensitive
  data to fixtures, screenshots, traces, prompts, or PR descriptions.
- Keep migrations explicit. Explain compatibility, backfill, failure handling, and
  rollback/forward recovery; test against disposable data.
- Pin a lockfile; use `npm ci` in CI. Avoid unrelated dependency upgrades and
  document new dependencies, licenses, maintenance risk, and integration choices.
- Install eve integrations only for an active, implemented use case with validation.
  Registry discovery and roadmap candidates are not reasons to install anything.
  Remove unused integration code/configuration within the relevant change; do not
  delete shared external resources or credentials as incidental cleanup.
- Version templates, scoring rubrics, metrics, and public contracts. Preserve
  provenance and compatibility or specify a migration.
- Add useful telemetry: correlation IDs, state changes, error category, duration,
  and cost, with confidential content redacted.

## Verification by change type

| Change | Minimum evidence |
| --- | --- |
| Governance/docs | `npm run check:docs`; review links, scope, and requirement coverage |
| TypeScript/runtime | Typecheck, build, focused checks for changed behavior |
| Authorization/context/RAG | Denial and cross-customer/partner tests; drafts, retraction, staleness and injection |
| State or financial/capacity logic | Boundary, zero/missing input, concurrency, replay, deterministic formula tests |
| UI | CLI Playwright/WebKit, keyboard/responsive checks, synthetic visual evidence |
| Agent instructions/tools/retrieval | Representative evals, source fidelity, failure behavior, cost/latency limits |
| Database/deployment | Disposable migration validation, preview verification, recovery procedure |

Feature 002 adds unit, integration, contract, WebKit UI, local performance, and
opt-in live evaluation commands. Report only checks actually run for the change.
CI uses generated disposable credentials and no model key. Live evals require an
explicit `--live` flag, a local environment, and a recorded budget.

## Documentation and merge hygiene

Every PR states whether README needs updating and why. Update setup, implemented
capabilities, commands, configuration, limitations, and links in that PR. Update
the roadmap only when exit criteria have evidence. After merge, check README on
`main` matches delivered behavior; submit a corrective docs PR if it does not.
Do not create an automatic bot that rewrites README after every merge.
After a PR merges successfully, leave the merged PR closed and delete its
associated local and remote branch. Verify README on `main` after that cleanup.

Use the [PR template](.github/pull_request_template.md). Preserve decisions in the
spec or an architecture decision. Branch protection and required reviewers must be
configured separately by repository maintainers; this document does not claim they
are enabled. Never merge merely to finish an agent turn.
