# Turas

Customer maturity and delivery management for Vercel FDE, Professional Services,
TAM, account teams and partners.

Turas brings reviewed customer context, planning, staffing, execution and reporting
into one workspace. **Turi**, its eve-powered assistant, explains and proposes next
steps using authorized evidence. Human review—not a model response—determines which
facts and decisions become accepted.

**Status:** active development. Customer profiles through executive reporting and
TAM/support guidance (010), product expansion (011), product gaps (012) and partner enablement (013) are implemented. Local validation and basic hosted smoke
checks do not establish full Production workflow readiness. See the
[roadmap](ROADMAP.md) and feature validation records under [`specs/`](specs/).
Feature 016 pilot hardening is in progress; its local checkpoints do not establish
full hosted pilot readiness. [Draft PR 32](https://github.com/mcteer/turas/pull/32)
is the implementation checkpoint. All 43 required CI jobs passed at `94d3dc3`
(run `38326648341`); the subsequent storage/recovery checkpoint has a
657-case local pass, not new CI proof. Current recovery, hosted processing and
participant acceptance remain release blockers.
The owned recovery command now applies independently retained current denials and
audits actual permanent request fences, preserving committed denials across failed
audits. It remains an isolated recovery step; service recovery and hosted acceptance
are pending.

The current full local checkpoint passes 672 cases across 118 suites at `5c6a6d5`.
The earlier actual-model batch failed 003's citation gate, and independent LLM
review failed one 002 capability reply. Instruction corrections require fresh
verification; the capped evaluation has spent $1.806543 and no Context credits.
Unknown and withheld identifiers still fail the evaluator.

Recent Conversations provides owner-private Archive and Restore controls. Archived
chats remain available in Archived Conversations and retain their history.
Archive/restore requires migration 044. Apply the current migration manifest and
runtime grants as part of each schema-dependent release.

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

### Product Expansion

Product expansion opportunities (011) now have a [specification](specs/011-product-expansion/spec.md),
[implementation plan](specs/011-product-expansion/plan.md) and
[task list](specs/011-product-expansion/tasks.md). Merged implementation covers evidence-backed hypotheses, explainable ranking, owner review and bounded private Turi advice. Only `mcteer` assigns the internal account owner; that owner qualifies, defers, dismisses or reopens a hypothesis. Explicitly saved advice remains proposed.

Migrations 046–047 are explicit deployment prerequisites. `TURAS_011_DISABLED=1` disables new authoring, decisions and advice while governed retention continues. Recovery uses forward migrations and the same database/workflow pair. See the [validation record](specs/011-product-expansion/validation.md) for passing local, eight-case actual-model independent review and CI evidence. Feature 011 merged in [PR 22](https://github.com/mcteer/turas/pull/22); Preview/Production release and hosted acceptance remain separate.


Read-only MCP access (015) has a [specification](specs/015-read-only-mcp/spec.md),
[plan](specs/015-read-only-mcp/plan.md) and [tasks](specs/015-read-only-mcp/tasks.md),
merged in [PR 28](https://github.com/mcteer/turas/pull/28). It supports internal users and assigned partners
through scoped revocable access. Local and CI acceptance are recorded in the
[validation record](specs/015-read-only-mcp/validation.md); Production is enabled on schema 055 with runtime grants and authenticated SDK/HTTP/CLI WebKit validation, including actual research passage and citation reads. See [operations](docs/mcp-operations.md). Further
delivery/learning automation remains roadmap work. There is no external support-ticket connector. See the
[roadmap](ROADMAP.md) for proposed slices and dependencies.

### Product Gaps and Engineering Feedback

Feature 012 implements the [52-task plan](specs/012-product-gap-feedback/tasks.md) and adds proposed and reviewed gap narratives, separate customer impact observations, explicit merge/split decisions and distinct-customer counts. Internal members propose; canonical active internal administrator `mcteer` reviews, approves exact customer disclosure and records manual engineering handoffs. Confirmed impact requires accepted customer need and current direct product evidence. Resolved history is nonadditive. Evidence freshness is displayed separately from review recency and deterministic ordering.

Engineering detail and portfolio reports use deterministic templates and reviewed private Markdown/JSON exports for an exact audience. Handoff notes are human-reported and never send messages or resolve customer impact automatically. Source withdrawal, changed authority and expiry withhold content immediately; independent cleanup retains minimal identities and lifetime request tombstones.

Migrations 048–049 and explicit `npm run gaps:prepare` are release prerequisites. `TURAS_012_DISABLED=1` blocks new work while cancellation, reconciliation and retention continue independently of 009 enablement. Retain every key in `TURAS_012_RECEIPT_HASH_KEYS` needed to verify existing tombstones. Use the same database, private store and workflow directory during forward recovery. See the [quickstart](specs/012-product-gap-feedback/quickstart.md), [validation record](specs/012-product-gap-feedback/validation.md) and [release handoff](specs/012-product-gap-feedback/handoff.md). Production migrations through 051 and internal Product Gaps page/API checks passed
on 2026-10-09; engineering exports and full hosted workflow acceptance remain
unverified. See the [Production recovery record](docs/production-recovery-2026-10-09.md).

### Partner Delivery and Enablement

Feature 013 implements the [48-task plan](specs/013-partner-enablement/tasks.md):
assigned-customer navigation, reviewed what/how/why guides and individual learning
checkpoints. Internal members author guides; canonical active administrator mcteer
publishes guides, assigns eligible members and verifies demonstrations. Individual
customer grants and private conversations retain their existing boundaries.
Learning progress is separate from delivery acceptance and skills certification.

Explicit migrations 050–051 and runtime role grants are release prerequisites.
`TURAS_013_DISABLED=1` blocks new work while authorized reads, retirement,
withdrawal, reconciliation and retention continue. Original evidence withdrawal
withholds dependent content synchronously, including when cleanup is stopped.
See [operations](docs/partner-operations.md), the
[validation run guide](specs/013-partner-enablement/quickstart.md) and
[handoff](specs/013-partner-enablement/handoff.md). Local and CI evidence is recorded in the
[validation log](specs/013-partner-enablement/validation.md). Feature 013 merged in
[PR 24](https://github.com/mcteer/turas/pull/24). Production is on schema 051 and
internal Partner Delivery page/API checks passed; full partner-role and workflow
acceptance remains unverified. See the [recovery record](docs/production-recovery-2026-10-09.md).

### Governed Adaptive Learning

Feature 014 has a [specification](specs/014-governed-adaptive-learning/spec.md),
[design](specs/014-governed-adaptive-learning/plan.md) and
[66 implementation tasks](specs/014-governed-adaptive-learning/tasks.md). It adds
private feedback, budgeted Turi improvements and paired evaluation, administrator
publication/rollback, internal-only quarterly outcome metrics and bounded refresh
monitoring. Implementation and acceptance evidence are tracked in the validation
record. Production login and read boundaries were checked for internal and partner
roles; record-dependent hosted limits remain in the validation record.
Schema 052–054, runtime
grants and explicit workspace activation are required; new workspaces start
disabled. See [learning operations](docs/learning-operations.md), the
[validation record](specs/014-governed-adaptive-learning/validation.md) and
[handoff](specs/014-governed-adaptive-learning/handoff.md) for current local, actual-model, CI and hosted validation status.

### Pilot Hardening and Launch Readiness

Feature 016 has a [specification](specs/016-pilot-hardening/spec.md),
[implementation plan](specs/016-pilot-hardening/plan.md) and
[84 tasks](specs/016-pilot-hardening/tasks.md) for a controlled internal and
assigned-partner pilot. The plan covers a synthetic Production pilot workspace,
workspace-bound sessions, durable private files and hosted processing, recovery,
retention, access, operating limits and attributable user feedback. Implementation
is in progress, with 63 of 84 tasks complete. The complete local catalog passed
640/640 named cases and all 43 required CI jobs passed at `08ef152`; full
predecessor composition, WebKit, recovery/lifecycle and build gates are green.
Owned load, dependency-fault and encrypted capture checks are recorded in the
[validation record](specs/016-pilot-hardening/validation.md). These checks do not
finish the remaining storage/recovery/hosted journey implementation or authorize
a pilot release.
A separate work-controlled Neon archive contains an authenticated encrypted
Production database safety copy. Its disposable restore verified content and the
055→057 migrations while keeping runtime access locked; this is database-only
proof, not a completed Production backup service. Minimized Production denial/
replay metadata is separately encrypted and retained beyond backup expiry;
restored-target reconciliation remains unfinished. A separate locked-owner audit
now checks request fences against independently authenticated current archive
bytes and actual replay functions, triggers, indexes and immutable protections;
it does not clear recovery holds or settle unknown provider effects.
The independent archive also retains governed native cancellation intents and
terminal provenance; old hosted native work has not yet been retired. The current
runner covers exact HTTP profile review and the pinned MCP consumer, while the
remaining linked hosted journeys are still being implemented. A registered owned
HTTP check now links reviewed profiles and cited plans to delivery activity and
normal report publication, with actual PDF/PPTX rendering and authenticated file reads.
The extended check reviews a located uploaded source and verifies that normal
withdrawal blocks its citations and derived report files. Separate milestone review
now exercises explicit start, review request and acceptance against reviewed activity.
An additional normal HTTP check publishes and assigns a partner guide, records a
partner demonstration and requires mcteer verification; withdrawing its source
removes current learning credit. These are owned synthetic checks, with no real
participant feedback or skills certification.
Report source checks now reconcile a cited plan's current retrieval digest as
well as direct profile digests, preserving audience and withdrawal fences.
Recovery authority, hosted services, scheduled backups and actual participant
acceptance remain pending; local checks do not establish pilot readiness. See the
[handoff](specs/016-pilot-hardening/handoff.md) for scope and execution gates.

## Technology

TypeScript, Next.js 16, React 19, eve and PostgreSQL 17/18 with pgvector. Development
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
export SPECIFY_FEATURE_DIRECTORY=specs/013-partner-enablement
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

CLI deployments use the checked-in `.vercelignore` to exclude credentials,
private local artifacts, workflow stores, dependencies and generated output.
Preserve the selected `.env.local` when eve pulls hosted environment variables;
Production credential changes require a new compatible deployment and live login checks.

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

## Public Customer Research

The authorized Production run on 2026-10-08 UTC saved 184 reviewed public dossiers:
183 named companies and one anonymous published case. The inventory covers 105
current directory logos and 116 canonical case studies across ten archive pages.
It retained 1,926 attributed findings across 766 source revisions, with six-area
coverage and 304 explicit no-finding gaps. All 1,532 public index jobs completed;
three real hybrid searches returned exact public-source citations. The original
six customer references remain, and accepted private profile records remain zero.
See the [validation record](specs/005-governed-rag-research/validation.md) for scope,
usage and the separate application-release checks.

Public customer recon now previews four broad searches and can retain multiple
checked sources, including Vercel case studies, employee talks and practitioner
reports outside the customer's own domain. Existing admitted requests retain their
original host policy. Source text is quoted evidence; a host, mention or generated
summary never establishes employer-wide deployment or accepted internal facts.

The authorized operator batch researches a reviewed official Vercel directory and
paginated story inventory. It records six coverage areas, exact source passages,
dates, caveats, unknowns and provider usage, with source signatures and checkpointed
provider dispatches. Customer Profiles show attributed findings and public research
coverage. Rejected or withdrawn evidence is not restored by a cached result.

```sh
npm run research:customers -- --live --production \
  --manifest local-artifacts/customer-research/roster.json \
  --output local-artifacts/customer-research/run --collect-only
```

Run one Production import process at a time; workspace authorization locks serialize
these writes. Import failures retain a private diagnostic for exact idempotent retry.
Use `--import-only` with an immutable copied checkpoint to save reviewed dossiers
without new provider calls. Omit `--collect-only` only for the explicitly authorized
Production import after
migration 045. The command verifies the marked target and active administrator;
it does not migrate schemas. It preserves existing customer IDs, grants and private
facts. Missing public identities become sourced, non-synthetic canonical anchors.
Provider/model failures, empty reviewed outputs and unsupported areas remain visible
gaps. Empty dossiers are not imported as successful research. Reviewed inventory
entries may include public identity URLs and a discovery qualifier for ambiguous
brand names; source quotations still have to establish the exact subject. An
anonymous published case retains its public descriptor and unknown identity. Every customer
gets six discovery queries and up to sixteen pinned public fetch attempts; model
synthesis/review/correction stays bounded by six calls, no automatic provider retry,
an eight-hour process deadline and a $50 AI Gateway model-cost ceiling. Discovery
provider charges are separate and recorded as call counts when billing metadata is
unavailable. Captured excerpts may be bounded; an omitted section is not evidence
that the source lacks information. Checkpoints and source captures are private,
ignored files. An interrupted dispatched call requires reconciliation before reuse.
`--reconcile-failed-models` permits one explicitly recorded additional attempt for
a failed model response, within the original six-call limit; the failed dispatch
remains in the checkpoint and may have incurred provider charges. It never replays
a dispatch whose completion is ambiguous. A private `STOP` file in the output
directory stops admission after the current accounts finish.

Disable the operator command to stop intake; retain immutable receipts and existing
sources. Use the normal source withdrawal workflow to remove a bad public finding.
Real public batch sources may be indexed through the existing retrieval worker when
its immutable batch receipt and current source eligibility agree. A bounded source
selector keeps operator indexing within this public inventory; existing private
source and synthetic-worker restrictions remain in place.
This command neither approves private context nor publishes cross-customer learning.

The 016 full 003 evaluation may use its separately authorized 32-step allowance;
ordinary 003 evaluation retains 14 steps. This supplement preserves the original
shared model/research budget and requires fresh committed deterministic proof.
Capture and independent review both validate this allowance through the explicit
private operator runtime; the current deterministic inventory is 680 cases in
121 suites. The complete 677-case checkpoint passes at f988c93; fresh complete
proof is required for the added hosted conversation and browser checks.

Independent semantic evaluation may use the separately requested LLM judge with
actual captures and governing rubrics. Human operator and pilot observations remain
required. Quality setup verifies actual 016 container ownership, native clone startup,
fixture scope and worker budget-guard inheritance before further paid execution.
Quality stages retain private source-bound workspaces and native captures until
independent review, including retrieval query, citation and partner-scope evidence.
Temporary containers and app processes still clean up after each stage.
Evaluation clones initialize their evidence roots in clean owned environments.
