# Turas

Turas is a customer maturity and delivery platform for Vercel Forward Deployed
Engineering, Professional Services, TAM, account teams and partners. **Turi**, its
eve assistant, will connect governed customer context to delivery plans, staffing,
execution, reporting and learning.

## Current state

Feature 002 was **merged in [PR 2](https://github.com/mcteer/turas/pull/2)** after local and CI validation. The current build has
explicit Postgres migrations, the three temporary demo logins, customer grants,
private owned conversations, guarded eve routes, durable response history, a
maintenance worker and a responsive web shell. Customer references are synthetic
and limited to identity and display name. Full customer profiles, attachments,
accepted context, RAG, delivery plans, staffing, reports and MCP remain planned.
No speculative eve integrations have been installed. The configured model is
unchanged. The application has not been deployed or validated on hosted infrastructure.

The old demo at `../turas-back` was reviewed as a reference only. Its fixtures,
credentials, data and unused integrations are not the new platform. See the
[reference review](docs/legacy-review.md) and [visual contract](docs/design-reference.md).

## Start here

- [Roadmap and delivery order](ROADMAP.md)
- [Product blueprint and requirement coverage](docs/product-blueprint.md)
- [Proposed architecture](docs/architecture.md) and [decision register](docs/decisions.md)
- [Evidence, quality scoring and approval policy](docs/evidence-policy.md)
- [Plan and report templates](docs/templates/README.md)
- [Foundation spec and plan](specs/001-platform-foundation/spec.md)
- [Feature 002 specification](specs/002-identity-platform-shell/spec.md) and
  [implementation plan](specs/002-identity-platform-shell/plan.md), with
  [implementation tasks](specs/002-identity-platform-shell/tasks.md) and
  [local validation](specs/002-identity-platform-shell/validation.md)
- [Feature 003 specification](specs/003-customer-profile-review/spec.md) and
  [implementation plan](specs/003-customer-profile-review/plan.md), with
  [implementation tasks](specs/003-customer-profile-review/tasks.md) — analysis and
  implementation pending
- [Contributing](CONTRIBUTING.md), [coding-agent instructions](AGENTS.md), and
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

`npm run dev` supervises Next.js, eve and the Postgres-backed maintenance worker.
The web app is available at the configured `TURAS_APP_ORIGIN`. The `mcteer` login
is an internal administrator, `panel` an internal employee, and `partner` an
external member assigned only Cedar in the synthetic demo. Internal members can
see every customer reference, including new ones; each account sees only its
own chats. Claims typed into chat remain unverified and cannot update profiles.
The app does not yet accept attachments.
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

The database tests require the disposable test environment variables in the
runbook. UI checks use WebKit from the command line and synthetic data. Both
compile targets are included in `build:check`; it skips eve sandbox prewarming
and does not establish hosted readiness. Optional `smoke:local:live` and
`eval:behavior:local` commands require an explicit `--live` flag and use the
configured model. Keep all real credentials in ignored `.env.local`. Full
authentication is deferred until explicitly resumed following hiring.

## Spec Kit workflow

The official [Specify CLI installation](https://github.github.com/spec-kit/installation.html)
is pinned to the release used for this repository:

```sh
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.0.12
specify version
```

Project-local Codex skills are already committed in `.agents/skills/`; start or
restart the coding session in this project to discover them. No global prompt
directory changes are required. Use `$speckit-specify`, `$speckit-clarify`,
`$speckit-plan`, `$speckit-tasks`, `$speckit-analyze`, `$speckit-implement` and
`$speckit-converge` as described in [CONTRIBUTING](CONTRIBUTING.md).

Spec Kit 1.x selects features independently of the Git branch. For the active slice:

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/003-customer-profile-review
.specify/scripts/bash/check-prerequisites.sh --json --require-spec
```

Create Git branches explicitly; the optional Git extension is not installed.
`.specify/feature.json` is a local ignored pointer. Do not rerun `specify init
--force` on a normal checkout. Upgrades require reviewing the official upgrade
procedure and generated changes while preserving the constitution and authored docs.

## Delivery and documentation

The foundation merged in [PR 1](https://github.com/mcteer/turas/pull/1). The active
slice is **003: customer profiles, maturity and context review**, with its spec
clarified, implementation planned and tasks generated. Analysis and implementation are next.
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

The repository was disconnected from Vercel on 2026-09-27 to prevent automatic
deployments until Turas can replace the existing application. Do not reconnect
or deploy as part of 003. Hosted validation and project
alignment are deferred to replacement readiness. The earlier Next.js preview failure
is recorded historically in the [foundation validation record](specs/001-platform-foundation/validation.md).
