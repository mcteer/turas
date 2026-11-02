# Turas

Turas helps Vercel account and delivery teams turn customer evidence into reviewed
plans, coordinated delivery and measurable outcomes. It brings FDE, Professional
Services, TAM, account and partner work into a shared customer workspace.

Turi, the built-in assistant, helps people research, explain and draft using the
context they are allowed to access. Evidence, proposals, approvals and completed
work remain distinct records with inspectable sources and history.

Start a conversation with Turi, select a customer when useful, and use the **+**
menu to add files, links or existing customer sources.

## What You Can Do

| Area | Capabilities |
| --- | --- |
| Customer understanding | Maintain customer and workload profiles, stakeholders, evidence-backed maturity assessments and reviewed change history. |
| Evidence and research | Upload private artifacts, select passages, research public sources and retrieve eligible evidence with citations, dates and quality. |
| Delivery planning | Draft and review delivery plans and technical designs; compare revisions and establish milestone baselines. |
| Staffing and execution | Review skills and capacity, propose allocations, record effort, manage risks and scope changes, and track evidenced outcomes. |
| Customer guidance | Maintain readiness checks, recommended actions, procedural support guidance and evidence-backed expansion hypotheses. |
| Reporting and feedback | Review status reports, generate executive PDFs and QBR slides, and prepare governed product-gap and engineering feedback. |
| Partner enablement | Share assigned-customer delivery context, publish reviewed what/how/why guides and track individual learning checkpoints. |
| Turi and integrations | Use private conversations, governed adaptive learning and scoped, revocable read-only MCP access. |

A typical workflow is to select a customer and workload, inspect the available
evidence, draft a proposed action or plan, review its exact revision, and track
execution against the accepted baseline. Customer maturity, delivery progress and
commercial opportunity are tracked separately.

### Partner Access and Privacy

Partners see explicitly assigned customer delivery data and eligible published
guidance. They do not receive general workspace access to personnel, financial or
internal account information. Internal users can access workspace customer
references; **conversations remain private to their owner for every role**.

Turi uses the same server-side authorization and evidence rules as the application.
Model wording cannot approve an uploaded claim, allocate staff, publish guidance
or mark delivery complete. Withdrawal and changed access affect subsequent use.
See the [evidence policy](docs/evidence-policy.md) and
[partner operations guide](docs/partner-operations.md).

## Project Status

Turas is under active development. Production hardening is deployed: ordinary
account access, chat reliability, private storage, bounded processing, maintenance
and backup/recovery protections are in place. Production login, privacy and a normal
chat request passed verification; service readiness and all 15 maintenance classes
were healthy at the release check.

The [Eve upgrade and specialist continuity](specs/020-eve-runtime-upgrade/spec.md)
implementation includes retained specialist follow-ups, task-specific Stop and
progress controls, verified in local native and WebKit checks. Compatibility and
hosted release acceptance are still in progress; these changes are not yet released.

Implementation, local checks, CI, Preview acceptance and Production verification
are recorded separately. A passing local test does not establish hosted behavior,
and a feature listed above may require environment preparation or explicit activation.

Use the [hardening validation record](specs/016-pilot-hardening/validation.md) and
[release handoff](specs/016-pilot-hardening/handoff.md) for exact release evidence,
recovery-assurance limits and operational follow-up. The [roadmap](ROADMAP.md) describes feature scope and dependencies;
[feature specifications](specs/) contain the detailed contracts and acceptance
records. Historical deployment and incident details belong in those records.

## Getting Started

### Prerequisites

- Node.js 24 and npm; the repository pins Node in [`.node-version`](.node-version).
- PostgreSQL with pgvector, a development database, and a **separate disposable
  test database**. Follow the [platform quickstart](specs/002-identity-platform-shell/quickstart.md)
  for database, environment-marker and runtime-role setup.
- Docker for the isolated artifact scanner, parser and report-rendering checks.
- `lsof` for owned-process verification and cleanup. On macOS, include `/usr/sbin`
  in `PATH`. Linux checks that require process-owner visibility need root or the
  documented noninteractive `sudo` access.
- A Vercel AI Gateway credential for live Turi requests. Deterministic checks do
  not require live model access.

### Install and Configure

```sh
npm ci
npm ci --prefix packages/artifact-extractor
```

`npm ci` also installs the pinned local sandbox provider used by Eve during
local execution and session shutdown; agent turns must not install it on demand.

On a **new checkout**, create local configuration:

```sh
cp .env.example .env.local
```

Keep existing `.env.local` values when resuming an environment. Never commit
credentials, customer data, private stores or `.eve` runtime state.
[`.env.example`](.env.example) documents the available settings; start with:

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | Least-privilege application runtime connection. |
| `DATABASE_URL_UNPOOLED` | Direct owner connection used only for explicit migrations and grants. |
| `TURAS_ENVIRONMENT_ID` | Identity shared by the selected database and private stores. |
| `TURAS_APP_ORIGIN` | Exact application origin, such as `http://localhost:3000`. |
| Application account usernames and passwords | Configured application accounts described below. |
| `TURAS_MAINTENANCE_SECRET` | Private maintenance secret of at least 32 characters. |
| `TURAS_ARTIFACT_STORE_ROOT` | Absolute private-store path outside `public/`. |
| `AI_GATEWAY_API_KEY` | Live model access through Vercel AI Gateway. |

Provision the runtime login using the platform quickstart. Run the application
with that login rather than the database owner. Keep the pooled and direct Neon
URLs on the same endpoint and database. The private I/O fence preserves the runtime
login when it opens the direct session required for its recovery lock.

### Initialize and Run

For a **new, empty development database** with its environment marker configured:

```sh
npm run db:init
npm run db:roles
npm run db:bootstrap
npm run dev
```

Open the configured `TURAS_APP_ORIGIN`. The development supervisor starts Next.js,
eve and the PostgreSQL maintenance worker together.

For an existing database, back up the data and use `npm run db:migrate` followed
by `npm run db:roles`. Initialization is for empty databases. Preserve the selected
database and `.eve/.workflow-data` together across restart and recovery checks;
request handlers never initialize or migrate schemas.

Artifact intake requires explicit private-store and scanner preparation in the
[artifact quickstart](specs/004-chat-artifact-ingestion/quickstart.md). Staffing and
reporting have additional prerequisites in the
[staffing quickstart](specs/007-skills-staffing/quickstart.md) and
[reporting operations guide](docs/reporting-operations.md).

### Application Accounts

Preview deployments use the same `mcteer` credentials as Production. They inherit
the existing sensitive credential record; local or test passwords must not
override it. Verify this with `npm run preview:credentials:check`.

Application accounts are configured privately by the environment operator.
Passwords are never published in this repository.

| Account | Intended access |
| --- | --- |
| `mcteer` | Internal administrator and designated manager/reviewer actions. |
| `panel` | Internal member access and proposals; manager-only approval remains restricted. |
| `partner` | Explicitly assigned customer delivery data and eligible partner guidance. |

All three retain owner-private conversation boundaries. See the
[platform quickstart](specs/002-identity-platform-shell/quickstart.md) for setup.

## Development and Testing

The runtime is pinned to **Eve 0.91.0**. Existing conversations from the older
runtime remain readable as saved history; start a new conversation to use the
current runtime with fresh authorization. Apply the checked-in migrations before
running an upgraded deployment.

To explicitly recover retained local runs, start
`npm run dev:eve -- --resume --no-ui` before `npm run dev` in a second terminal.
Eve loads `.env.local`; keep the selected database and `.eve/.workflow-data`
together. A normal new development generation leaves older runs dormant. This
local recovery mode is separate from hosted recovery verification.

Dependabot checks the three npm projects and GitHub Actions weekly on Monday at
09:00 America/Denver. Eve and its AI SDK peer updates are grouped for compatibility
review. Dependency PRs follow the normal review and CI process.

Start with the checks appropriate to the change:

```sh
npm run check:docs
npm run typecheck
npm run test:unit
npm run build:check
```

`build:check` validates both eve and the Next.js application. Feature-specific
checks cover their own contracts, integration, recovery and UI behavior; the
[contribution guide](CONTRIBUTING.md) explains which checks to run. For example:

| Change | Feature checks |
| --- | --- |
| Evidence retrieval | `npm run test:retrieval` / `npm run retrieval:ui:check` |
| Delivery plans | `npm run test:plans` / `npm run plans:ui:check` |
| Staffing | `npm run test:staffing` / `npm run staffing:ui:check` |
| Partner enablement | `npm run test:partners` / `npm run partners:ui:check` |
| Production hardening | `npm run test:pilot` / `npm run pilot:ui:check` |

Run UI checks through command-line Playwright and WebKit, including the configured
desktop and mobile profiles. Install the required browser runtime with:

```sh
npx playwright install --with-deps webkit
```

Disposable tests must use their own marked database and private stores. Never
point them at Preview or Production. Live model evaluations require explicit
opt-in, finite budgets and private captures; mocked or deterministic results are
not actual-model acceptance. Follow the feature's quickstart before running an
operational, recovery or paid check.

## How the Repository Fits Together

The web application, Turi tools, jobs, reports and MCP interface share one governed
domain layer. Authorization is applied before retrieval, and source eligibility
is checked again before use. Explicit migrations, versioned contracts,
deterministic calculations and idempotent writes protect durable records.

| Path | Responsibility |
| --- | --- |
| `app/` | Next.js application pages and HTTP routes. |
| `agent/` | Turi's eve configuration, instructions and tools. |
| `lib/` | Shared domain rules, authorization and server services. |
| `migrations/` | Explicit, ordered database migrations. |
| `scripts/` | Preparation, verification, evaluation and operational commands. |
| `tests/` | Unit, integration, contract, UI and feature fixtures. |
| `packages/` | Isolated processing components, including artifact extraction and report rendering. |
| `specs/` | Feature specifications, plans, tasks and validation evidence. |
| `docs/` | Product, architecture, policy, design and operations guidance. |

The stack uses TypeScript, Next.js 16, React 19, eve, PostgreSQL with pgvector,
Vercel AI Gateway and Playwright. Installed package versions in
[`package.json`](package.json) and the lockfile are authoritative.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md) and the
[project constitution](.specify/memory/constitution.md) before implementation.
Turas uses the checked-in Spec Kit workflows and feature artifacts to keep scope,
design and acceptance aligned.

When resuming production hardening, select its feature directory explicitly:

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/016-pilot-hardening
```

Read that feature's `spec.md`, `plan.md` and `tasks.md`. A roadmap entry does not
authorize implementing it. Keep the README and relevant feature/release status in
the same PR as the change, obtain review and complete the required checks.

## Operations and Security

Hosted releases require explicit target verification, a recovery backup, migration
rehearsal, runtime grants and compatible schema/code deployment. After merge,
verify the deployed commit, schema and changed behavior with authenticated HTTP
and CLI Playwright/WebKit checks. CI alone is not release completion.

Secrets, private artifacts and customer data stay outside Git and public assets.
Runtime access uses least privilege. Model calls and hosted processing use explicit
budgets; uncertain charges remain accounted for until they can be reconciled.
Email delivery, learning and other governed features require their documented
activation rather than being enabled by setup alone.

Start with [production operations](docs/pilot-operations.md),
[data lifecycle and recovery](docs/pilot-lifecycle.md) and the
[environment handoff](docs/environment-handoff.md). Feature-specific runbooks cover
[reporting](docs/reporting-operations.md), [support](docs/support-operations.md),
[partners](docs/partner-operations.md), [learning](docs/learning-operations.md) and
[MCP](docs/mcp-operations.md).

## Documentation and Help

| Need | Start here |
| --- | --- |
| Product intent and boundaries | [Product blueprint](docs/product-blueprint.md) |
| System design and rationale | [Architecture](docs/architecture.md) and [decisions](docs/decisions.md) |
| Evidence and approval rules | [Evidence policy](docs/evidence-policy.md) |
| UI conventions | [Design reference](docs/design-reference.md) |
| Maturity definitions | [Maturity rubric](docs/maturity-rubric.md) |
| Plans and report formats | [Templates](docs/templates/README.md) |
| Current and proposed feature scope | [Roadmap](ROADMAP.md) and [specifications](specs/) |
| Bugs and proposed changes | [GitHub issues](https://github.com/mcteer/turas/issues) and [contribution guide](CONTRIBUTING.md) |

When reporting a problem, include the affected workflow, environment, expected
behavior, actual behavior and reproducible steps. Keep credentials and private
customer information out of public issues and logs.

## License

This repository does not currently declare a project-wide license. Third-party
licenses and required provenance remain with their respective components.
