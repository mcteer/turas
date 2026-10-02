# Turas

Turas is a customer maturity and delivery platform for Vercel Forward Deployed
Engineering, Professional Services, TAM, account teams and partners. **Turi**, its
eve assistant, will connect governed customer context to delivery plans, staffing,
execution, reporting and learning.

## Current state

Features 002 and 003 were merged in [PR 2](https://github.com/mcteer/turas/pull/2)
and [PR 4](https://github.com/mcteer/turas/pull/4) after local and CI validation. The current build has
explicit Postgres migrations, the three temporary demo logins, customer grants,
private owned conversations, guarded eve routes, durable response history, a
maintenance worker and a responsive web shell. Feature 003 adds typed customer
profiles, projected record history, Pending review,
maturity assessments, attributed synthetic research, evidence quality and conflict
review, partner projections, and bound agent context
for local testing. Feature 004 adds local private attachment intake, isolated
scan/extraction, exact-source review, bounded unverified chat selection and
versioned cleanup. Feature 006 delivery plans are merged; staffing is locally validated,
while reports and MCP remain planned.
Feature 005 is merged in [PR 8](https://github.com/mcteer/turas/pull/8). Governed retrieval,
shared knowledge publication, bounded research, refresh and typed conflict
flows have focused local checks and CLI WebKit journeys. A 40-query synthetic
live embedding evaluation passed its citation and recall gate, and the local
5,000-passage hybrid load gate, all twelve local actual-output Turi review
cases and a disposable paired restart/recovery drill passed. These 005
changes have not been released.
Feature 006 delivery plans and technical designs have a [specification](specs/006-delivery-plans/spec.md),
[implementation plan](specs/006-delivery-plans/plan.md) and
[task breakdown](specs/006-delivery-plans/tasks.md). The implementation merged in
[PR 11](https://github.com/mcteer/turas/pull/11) and includes schema 029–031, manual plan authoring, exact human
review, canonical baseline replacement, governed revision comparison and bounded
Turi drafting with native replay and cancellation. The
[validation log](specs/006-delivery-plans/validation.md) records the passing
disposable domain/recovery checks, local 1,000-plan performance gate,
four-project WebKit matrix and reviewed eight-case live evaluation. Preview was
explicitly upgraded to schema 031 and inspected afterward; local unauthenticated
app and Eve health smoke passed. The full PR CI workflow passed; the feature has
not been released.
Feature 007 has a [specification](specs/007-skills-staffing/spec.md),
[design](specs/007-skills-staffing/plan.md) and
[implementation tasks](specs/007-skills-staffing/tasks.md). It implements reviewed
competencies and private workforce imports, dated capacity, explained matching,
human-confirmed allocations, planned operations/economics and governed read-only
Turi advice. Only `mcteer` has staffing-manager and finance authority; delegation
is deferred. The [validation log](specs/007-skills-staffing/validation.md) records
passing disposable domain and regression tests, 112 CLI WebKit cases, paired
recovery, the 500-resource load gate and eight reviewed live advisory cases.
Preview was explicitly upgraded to schema 034 and read-only inspected afterward;
local unauthenticated app and runtime-role smoke passed. Feature 007 merged in
[PR 13](https://github.com/mcteer/turas/pull/13) after passing review-head CI.
The feature has not been deployed or validated on hosted infrastructure.
No speculative eve integrations have been installed. The configured model is
unchanged. The application has not been deployed or validated on hosted infrastructure.

The old demo at `../turas-back` was reviewed as a reference only. Its fixtures,
credentials, data and unused integrations are not the new platform. See the
[reference review](docs/legacy-review.md) and [visual contract](docs/design-reference.md).

## Start here

- [Roadmap and delivery order](ROADMAP.md)
- [Product blueprint and requirement coverage](docs/product-blueprint.md)
- [Proposed architecture](docs/architecture.md) and [decision register](docs/decisions.md)
- [Hosted environment handoff](docs/environment-handoff.md) for the former Vercel variables and Neon Preview selection
- [Evidence, quality scoring and approval policy](docs/evidence-policy.md)
- [Plan and report templates](docs/templates/README.md)
- [Foundation spec and plan](specs/001-platform-foundation/spec.md)
- [Feature 002 specification](specs/002-identity-platform-shell/spec.md) and
  [implementation plan](specs/002-identity-platform-shell/plan.md), with
  [implementation tasks](specs/002-identity-platform-shell/tasks.md) and
  [local validation](specs/002-identity-platform-shell/validation.md)
- [Feature 003 specification](specs/003-customer-profile-review/spec.md) and
  [implementation plan](specs/003-customer-profile-review/plan.md), with
  [implementation tasks](specs/003-customer-profile-review/tasks.md) and
  [local validation](specs/003-customer-profile-review/validation.md) — merged on `main`, no hosted release
- [Feature 004 specification](specs/004-chat-artifact-ingestion/spec.md),
  [implementation plan](specs/004-chat-artifact-ingestion/plan.md) and
  [tasks](specs/004-chat-artifact-ingestion/tasks.md) and
  [local validation](specs/004-chat-artifact-ingestion/validation.md) — merged on `main` with local and CI validation, no hosted release
- [Feature 005 specification](specs/005-governed-rag-research/spec.md),
  [implementation plan](specs/005-governed-rag-research/plan.md),
  [tasks](specs/005-governed-rag-research/tasks.md) and
  [validation guide](specs/005-governed-rag-research/quickstart.md) and
  [local validation log](specs/005-governed-rag-research/validation.md) — merged on `main` with local and CI validation, no hosted release
- [Contributing](CONTRIBUTING.md), [development instructions](AGENTS.md), and
  [constitution](.specify/memory/constitution.md)

## Local setup

Use Node **24** (`.node-version`), npm, local Postgres **17**, and CLI
Playwright/WebKit. Install locked dependencies, configure ignored `.env.local`
using [.env.example](.env.example), then explicitly initialize an empty local
database with the configured environment marker. Provision a separate
`turas_runtime` login and run the role grants after migrations. Keep a distinct
disposable test database; the [002 runbook](specs/002-identity-platform-shell/quickstart.md)
has the setup and recovery details.

```sh
npm ci
npm run db:init
npm run db:roles
npm run db:bootstrap-demo
npm run dev
```

For an existing schema-013 local database, prepare the private artifact store
and images with `npm run artifacts:prepare`, then run `npm run db:migrate` and
`npm run db:roles` explicitly before using attachments. The
[004 quickstart](specs/004-chat-artifact-ingestion/quickstart.md) covers the
separate disposable test store and recovery checks.

For an optional populated synthetic profile in local or disposable test environments,
run `npm run db:seed-profile-demo`. It adds reviewed Juniper examples without
overwriting later accepted revisions. For the two-workload, 25-record scripted
walkthrough fixture, run `npm run db:seed-profile-walkthrough`. The [003 quickstart](specs/003-customer-profile-review/quickstart.md)
describes the review, evidence and guarded recovery journeys.

`npm run dev` supervises Next.js, eve and the Postgres-backed maintenance worker.
The web app is available at the configured `TURAS_APP_ORIGIN`. The `mcteer` login
is an internal administrator, `panel` an internal employee, and `partner` an
external member assigned only Cedar in the synthetic demo. Internal members can
see every customer reference, including new ones; each account sees only its
own chats. Profile and explicitly shared chat claims remain Pending until steward
review; accepted facts and attributed research are kept distinct. The app does not
yet accept attachments on the unmigrated selected database. The 004 local setup
and explicit migrations are in the [004 quickstart](specs/004-chat-artifact-ingestion/quickstart.md).
After a local eve dev restart, an in-flight run from an older development
generation may be quarantined. Its stored message and deadline remain visible;
the worker flags an unconfirmed overdue turn for operator review without
starting another model turn. See the [restart evidence](specs/002-identity-platform-shell/validation.md).

For local checks, use:

```sh
npm run check:docs
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:contracts
npm run build:check
npm run test:ui
npm run test:performance
```

The guarded local recovery drills are
`npm run upgrade:profile:check -- --disposable --container turas-002-postgres`
and `npm run restore:demo:check -- --disposable --container turas-002-postgres`.
They create and drop temporary local databases; neither resets the application
database. The integration and contract scripts clear only disposable test-profile
rate windows before their suites so repeated local runs are independent.

The database tests require the disposable test environment variables in the
runbook. UI checks use WebKit from the command line and synthetic data. Both
compile targets are included in `build:check`; it skips eve sandbox prewarming
and does not establish hosted readiness. Optional `smoke:local:live` and
`eval:behavior:local` commands require an explicit `--live` flag and use the
configured model. Keep all real credentials in ignored `.env.local`. Full
authentication is deferred until explicitly resumed following hiring.
For the six-case synthetic profile behavior dataset, use
`npm run eval:behavior:local -- --feature 003 --live`; its outputs stay under
ignored `local-artifacts/` for actual-response review.
The 004 checks include `npm run test:artifacts`,
`npm run artifacts:recovery:check`, and
`npm run eval:behavior:local -- --feature 004 --live`. The last command runs
eight synthetic selected-source cases in a disposable app and database; review
the captured responses before claiming the behavior gate passed.
For 005, `npm run test:retrieval` runs the isolated deterministic unit, contract
and database checks against an explicitly marked disposable test database.
For the current 005 workspace, ignored `.env.local` selects the new
`turas_preview_005` database in Neon Preview for the pooled app runtime and
direct migrations. A read-only inspection found 16 legacy tables in the
original Preview database; they were left untouched. The new app database is
at schema 028 with marker `preview-neon-005`. A separate
`turas_test_005_neon` database and marker are configured for disposable tests.
See the [environment handoff](docs/environment-handoff.md). The legacy
Production site continues to use its Production Neon database.
`npm run retrieval:prepare -- --offline` checks local prerequisites without
migrating a database. Public research discovery uses the server-only
`CONTEXT_API_KEY` for Context.dev URL search. A live discovery and independent
public-page fetch/quote smoke passed;
`npm run research:workflow:live:check -- --live --disposable`
also passed one persisted public-practices path on a temporary clone of the
marked test database. It requires `TURAS_TEST_DATABASE_URL` and
`TURAS_TEST_ENVIRONMENT_ID` and drops that clone afterward. The full research
mode review passed twelve bounded actual-output cases locally. The disposable
recovery drill verified a bound native session after restart with a matched
synthetic database/store pair; it does not establish hosted backup restoration.

## Spec Kit workflow

The official [Specify CLI installation](https://github.github.com/spec-kit/installation.html)
is pinned to the release used for this repository:

```sh
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.0.12
specify version
```

Project-local Spec Kit commands are already committed in `.agents/skills/`; start or
restart the development session in this project to discover them. No global prompt
directory changes are required. Use `$speckit-specify`, `$speckit-clarify`,
`$speckit-plan`, `$speckit-tasks`, `$speckit-analyze`, `$speckit-implement` and
`$speckit-converge` as described in [CONTRIBUTING](CONTRIBUTING.md).

Spec Kit 1.x selects features independently of the Git branch. To inspect 004:

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/004-chat-artifact-ingestion
.specify/scripts/bash/check-prerequisites.sh --json --require-spec
```

Create Git branches explicitly; the optional Git extension is not installed.
`.specify/feature.json` is a local ignored pointer. Do not rerun `specify init
--force` on a normal checkout. Upgrades require reviewing the official upgrade
procedure and generated changes while preserving the constitution and authored docs.

## Delivery and documentation

The foundation merged in [PR 1](https://github.com/mcteer/turas/pull/1).
**004: chat attachments and artifact ingestion** merged in
[PR 6](https://github.com/mcteer/turas/pull/6) after local and CI validation.
It uses private
local storage and isolated scanning/extraction, selected evidence review,
unverified chat discussion and source lifecycle controls.
Features 002, 003 and 004 are merged with local and CI validation.
The merged 002 application provides the demo identities and shell. Its demo scope uses
`mcteer` for internal Vercel administrators/FDE/PS leadership, `panel` for internal
Vercel employees and `partner` for external partners. Internal users see all workspace
customer profiles; partners see only delivery-relevant information for assigned
customers. Accounts have separate chat histories and synthetic customer data or public research only.
The roadmap also includes reviewed shared product learnings available to all active
users, including partners, without exposing the originating customer. Shared retrieval
starts in 005; it is not implemented in 002.
Add an eve integration only when an active
feature uses it and verifies it. No speculative connector installation.

Deployment is a future feature action using `eve link` and `eve deploy`, as required
by [AGENTS](AGENTS.md). No manual provisioning or deployment is part of 001. Every relevant
PR updates README in the same change; maintainers verify freshness after merge.

The repository was disconnected from Vercel on 2026-09-27 and reconnected by the
maintainer on 2026-10-02. Git deployments are enabled: `main` is the Production
branch and other branches produce protected Previews. Web Analytics is enabled
on the project; the app integrates `@vercel/analytics` with page URL redaction
for customer, engagement, plan, resource, import and conversation identifiers.
Query strings and fragments are removed; unknown routes and custom events are
discarded. Local development uses the SDK's development mode.
The workspace uses a shared neutral design system with Geist typography, grouped
navigation, consistent page headers, form panels, accessible controls, and tables
that scroll within their panels. Customer profiles, knowledge, plans, staffing,
imports, finance, access, and sign-in use the same light/dark visual language.
Run `npm run workspace:ui:check` with the marked local test database selection to
validate the desktop/mobile Playwright/WebKit matrix on an owned disposable clone.
The check exercises real reads and writes with synthetic fixtures and no model calls.
The chat landing now uses a real composer with optional customer selection below
it, with “Customer (optional)” inside the selector in an inset context bar. The bar reserves space for a future
project selector. General technical conversations use private, customer-free scope (migration
035); customer tools and source selections still require an explicit customer.
See the [bounded chat correction](specs/002-identity-platform-shell/general-chat.md).
Hosted application validation, durable artifact storage and background worker
alignment remain release work. The earlier Next.js preview failure
is recorded historically in the [foundation validation record](specs/001-platform-foundation/validation.md).
