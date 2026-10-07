# Turas

Customer maturity and delivery management for Vercel FDE, Professional Services,
TAM, account teams and partners.

Turas brings reviewed customer context, planning, staffing, execution and reporting
into one workspace. **Turi**, its eve-powered assistant, explains and proposes next
steps using authorized evidence. Human review—not a model response—determines which
facts and decisions become accepted.

**Status:** active development. Customer profiles through executive reporting and
TAM/support guidance (010) are implemented. Local validation and basic hosted smoke
checks do not establish full Production workflow readiness. See the
[roadmap](ROADMAP.md) and feature validation records under [`specs/`](specs/).

## Features

### Customer Profiles and Maturity

Maintain customer/workload profiles, stakeholders and operating context. Record
maturity assessments against a versioned rubric, with evidence, unknowns and the
next measurable capability. Review proposed changes and inspect their history;
customer maturity stays separate from engagement progress.

### Evidence, Knowledge and Research

Upload private artifacts for isolated scanning and extraction, select passages
for discussion and submit claims for factual review. Retrieve eligible customer
evidence and published shared practices with citations. Run bounded public research,
review conflicts and refresh stale sources. Withdrawal and access changes govern
subsequent retrieval and use.

### Turi Conversations and Guidance

Use owner-private chat for general technical questions or explicitly selected
customer context. Ask Turi to draft plans or explain staffing and execution using
permitted inputs. Stop running responses and inspect saved status. Suggestions do
not approve facts, allocate staff or complete work; human decisions remain separate.

### Delivery Plans and Technical Designs

Author plans and designs, select evidence and submit exact revisions for review.
Compare revisions and establish or replace reviewed milestone baselines. Turi
drafting produces proposals, not accepted commitments.

### Skills and Staffing

Maintain reviewed competencies and dated capacity, identify demand and inspect
explained resource matches. Propose and review allocations, track unmet demand and
inspect planned operations and economics. Personnel and financial data have separate
access controls; a match is not a confirmed allocation.

### Engagement Execution

Record activities and time, review milestones and maintain risk, issue and scope-change
registers. Compare actual effort with forecasts and baselines. Record evidenced
handoffs, closeout and outcomes; reported activity is not accepted completion.

### Executive Reporting

Prepare and review weekly reports, publish corrections and generate executive PDFs
and editable QBR slides. Audience-specific projections control report content.
Email delivery uses a separate, default-off release switch and exact-recipient
receipts; local rendering does not prove live delivery.

### TAM and Support Guidance

Feature 010 adds customer/workload readiness, owned recommended actions, proposed
disposition changes and procedural escalation guidance. Internal users propose
changes; the designated reviewer accepts exact revisions. Assigned partners receive
accepted delivery-visible guidance only. Bounded Turi suggestions can be explicitly
saved as proposed actions. Human-reported handoff never means a ticket was sent,
acknowledged or resolved externally.

Readiness uses six explicit checks and a deterministic summary, with reviewed
actions and source-qualified history. Advice receives selected passages, original
dates and evidence quality before generation; each save remains a proposal. See the
[support specification](specs/010-tam-support-guidance/spec.md) and
[validation record](specs/010-tam-support-guidance/validation.md).

### Planned Capabilities

MCP access and further delivery/learning automation remain roadmap work, not
available integrations. There is no external support-ticket connector. See the
[roadmap](ROADMAP.md) for proposed slices and dependencies.

## Technology

TypeScript, Next.js 16, React 19, eve and PostgreSQL 17 with pgvector. Development
uses Node.js 24 and npm. Versions are pinned in [`package-lock.json`](package-lock.json).

## Getting Started

### Prerequisites

- Node.js **24** ([`.node-version`](.node-version)) and npm.
- PostgreSQL **17** with pgvector, a development database and a separate disposable
  test database.
- Docker for isolated artifact scanning/extraction and report rendering.
- An AI Gateway key for live Turi calls; deterministic tests do not require one.

Database, runtime-role and recovery details are in the
[platform quickstart](specs/002-identity-platform-shell/quickstart.md).

### Install and Configure

```sh
npm ci
npm ci --prefix packages/artifact-extractor
cp .env.example .env.local
```

On a new checkout, fill in ignored `.env.local` before running database/runtime
commands. Do not overwrite existing local configuration.
[`.env.example`](.env.example) lists available settings.

| Configuration | Purpose |
| --- | --- |
| `DATABASE_URL` | Application connection using the least-privilege runtime login |
| `DATABASE_URL_UNPOOLED` | Direct owner connection for explicit migrations and grants |
| `TURAS_ENVIRONMENT_ID` | Database/private-store environment marker |
| `TURAS_APP_ORIGIN` | Exact application origin, e.g. `http://localhost:3000` |
| Demo login names/passwords | Temporary synthetic accounts described below |
| `TURAS_MAINTENANCE_SECRET` | Private secret of at least 32 characters |
| `TURAS_ARTIFACT_STORE_ROOT` | Absolute private artifact-store path outside `public/` |
| `AI_GATEWAY_API_KEY` | Live model access, not deterministic test access |

Provision the separate `turas_runtime` login as described in the quickstart.
Do not use the owner connection as the application's runtime login.

### Initialize and Run

For a **new, empty development database** with its environment marker configured:

```sh
npm run db:init
npm run db:roles
npm run db:bootstrap-demo
npm run dev
```

Open `TURAS_APP_ORIGIN`. `npm run dev` supervises Next.js, eve and the PostgreSQL-backed
maintenance worker. For existing databases, use `npm run db:migrate` followed by
`npm run db:roles`, not initialization. Back up data before operational changes;
request handlers never initialize or upgrade schemas.

Artifact intake needs explicit private-store/scanner preparation; follow the
[artifact quickstart](specs/004-chat-artifact-ingestion/quickstart.md). Additional
staffing/reporting prerequisites are in the
[staffing guide](specs/007-skills-staffing/quickstart.md) and
[reporting operations guide](docs/reporting-operations.md).

### Demo Accounts

Passwords come from local configuration, not the repository.

| Login | Access |
| --- | --- |
| `mcteer` | Internal administrator; designated reviewer for manager-only workflows |
| `panel` | Internal member; proposes changes without manager-only approval authority |
| `partner` | Delivery data for explicitly assigned customers only |

Internal accounts can read workspace customer references. Conversations remain
owner-private for **every** role. These temporary logins are not a general-purpose
identity-provider integration.

## Development and Testing

```sh
npm run check:docs
npm run typecheck
npm run test:unit
npm run build:check
```

`build:check` compiles eve and Next.js; the web production check uses Webpack.
Database/browser tests require marked disposable configuration from the relevant
quickstart. Never point them at Preview or Production. Feature-specific runners
use owned environments and enforce complete suite discovery.

| Area | Deterministic Checks | CLI WebKit Checks |
| --- | --- | --- |
| Retrieval/research | `npm run test:retrieval` | `npm run retrieval:ui:check` |
| Plans | `npm run test:plans` | `npm run plans:ui:check` |
| Staffing | `npm run test:staffing` | `npm run staffing:ui:check` |
| Execution | `npm run test:execution` | `npm run execution:ui:check` |
| Reporting | `npm run test:reports` | `npm run reports:ui:check` |
| Support | `npm run test:support` | `npm run support:ui:check` |

Install browser prerequisites with `npx playwright install --with-deps webkit`.
UI checks use CLI Playwright/WebKit across desktop/mobile and light/dark themes,
not the host browser. Support smoke does not certify full acceptance.

Live evaluations require explicit `--live` opt-in and can incur provider costs.
Read the relevant validation guide first. Keep captures, logs and model outputs
in ignored `local-artifacts/`, never in public issues or PRs.

## Project Structure

```text
app/                  Pages, UI components and authenticated API routes
agent/                Turi instructions, tools, skills, hooks and channels
lib/                  Versioned contracts, domain logic and server services
migrations/           PostgreSQL migrations and integrity manifest
scripts/              Development, database, verification and recovery runners
tests/                Unit, contract, integration and browser tests
specs/                Feature specifications, plans, tasks and validation evidence
docs/                 Architecture, policies, runbooks and product documentation
packages/             Isolated artifact extraction components
report-renderer/      Isolated report-rendering runtime
report-templates/     Versioned templates and bundled font licenses
```

The old demo at `../turas-back` is a read-only reference, not the implementation
base. See the [legacy review](docs/legacy-review.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md) and the
[constitution](.specify/memory/constitution.md) for workflow, review and checks.
Select a feature explicitly rather than relying on the Git branch:

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/010-tam-support-guidance
```

Project-local Spec Kit commands live in `.opencode/commands/`; checked-in skills
live in `.agents/skills/`. If needed, install the pinned Specify CLI:

```sh
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.0.12
```

Do not reinitialize existing checkouts or overwrite customized governance.
Include documentation changes in the feature PR; merge after required checks pass.

## Operations and Security

- Keep credentials, customer/personnel data and runtime state out of commits and
  public output.
- Authorization and factual approval are enforced server-side. Uploads and chat
  claims do not become accepted facts through model wording.
- Keep maturity separate from engagement progress and commercial opportunity.
- Use synthetic fixtures. Preserve the database and `.eve/.workflow-data` during
  restart/recovery checks.
- Do not enable live reporting delivery or change hosted databases during routine
  setup. Deployment requires explicit maintainer authorization.

See the [environment handoff](docs/environment-handoff.md) for hosted configuration
and recovery limitations, and the [evidence policy](docs/evidence-policy.md) for
provenance and lifecycle rules.
Feature 010's disable, retention, receipt-key rotation and forward-recovery
procedures are documented in [support operations](docs/support-operations.md).

## Documentation and Help

- [Product blueprint](docs/product-blueprint.md) and [roadmap](ROADMAP.md)
- [Architecture](docs/architecture.md) and [decisions](docs/decisions.md)
- [Design reference](docs/design-reference.md)
- [Plan and report templates](docs/templates/README.md)

Open a repository issue for bugs/questions with reproduction steps and sanitized
diagnostics. Never include secrets or customer content.

## Hosting and Recovery

The repository was disconnected from Vercel on 2026-09-27 and reconnected by the
maintainer on 2026-10-02. Git deployments are enabled: `main` is the Production
branch and other branches produce protected Previews. Web Analytics is enabled
on the project; the app integrates `@vercel/analytics` with page URL redaction
for customer, engagement, plan, resource, import and conversation identifiers.
Query strings and fragments are removed; unknown routes and custom events are
discarded. Local development uses the SDK's development mode.

Hosted chat requires an active watchdog: admission fails closed when no worker
heartbeat is newer than 15 seconds. The minute cron at `/eve/v1/turas/watchdog`
runs a 65-second bounded worker, refreshing readiness every five seconds and
using database job leases for cancellation/retry. Set a Production-only
`CRON_SECRET` of at least 32 characters; browser cookies are not accepted by the
watchdog. Verify the generated function supports runs longer than 65 seconds,
cron invocation history, fresh database heartbeats and an authenticated chat
before declaring hosted recovery complete. A successful build alone does not
establish hosted readiness. Local development continues using its local worker.

## License

No project-wide license is currently declared. Do not assume redistribution
permission. Third-party assets retain their own license and provenance notices.
