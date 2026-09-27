# Turas Constitution

## Core Principles

### I. Specify the outcome before implementation

Every material feature MUST have a bounded specification, acceptance scenarios,
implementation plan, and actionable tasks under `specs/`. Requirements, decisions,
code, tests, and documentation MUST remain traceable. Small fixes can reference an
existing spec; cosmetic changes do not require a new feature ceremony. The roadmap
is a sequence of proposals, not evidence that functionality exists.

### II. Customer outcomes define maturity

Assessments MUST record workload scope, period, rubric version, evidence, unknowns,
and next measurable capability. Customer maturity, engagement lifecycle, product
adoption, account risk, and commercial opportunity MUST remain separate. Turas MUST
NOT equate spending, utilization, deployment count, or product count with customer
success. Business calculations MUST be deterministic and versioned.

### III. Evidence has provenance and a lifecycle

Manually supplied context MUST pass a server-enforced approval gate before use as
accepted customer fact. Independently discovered research MAY attach as attributed
research evidence under the evidence policy. Neither retrieval nor a quality score
grants approval. Sources, claims, revisions, publication/observation/retrieval dates,
reliability, conflicts, and withdrawal MUST be preserved. Derived outputs MUST
retain their source lineage.

### IV. Authorization precedes retrieval and action

All reads, search, agent tools, background jobs, exports, and MCP calls MUST enforce
workspace, customer, partner, user, and environment boundaries on the server.
Partner visibility MUST derive from explicit grants. No prompt, UI control, URL,
embedding, or shared model session is an authorization boundary. Customer content
MUST NOT become shared learning without an authorized, minimized contribution.

### V. Humans retain decision rights

The application MUST distinguish proposals from accepted plans, reservations from
assignments, and generated reports from delivery receipts. Context approval, plan
acceptance, staffing commitments, and external sends MUST have explicit authority,
an auditable decision, version checks, and idempotency. Authorized recurring sends
MAY operate under a visible, revocable policy with fixed scope and recipients.
Material changes to that scope require renewed authorization.

### VI. eve is the agent core

Use eve's documented tools, skills, subagents, channels, and durable execution
patterns. Read the installed task-specific docs before framework code. Search its
registry before building a named external integration. Preserve the selected model
unless the task explicitly changes it. Use Vercel products where they satisfy a
documented need; do not add infrastructure to maximize product count.
An eve integration MUST have an active feature use case and verification before
installation is included in a PR. Do not preload prospective or unused connectors.

### VII. Small changes, meaningful verification

Changes MUST be reviewable and carry checks appropriate to their behavior. Access,
approval, state transitions, calculations, migrations, and retries require targeted
automated tests. UI changes require accessible interaction and visual verification.
Agent behavior changes require representative evaluations. Documentation-only
changes require consistency/link checks, not artificial behavioral tests.

### VIII. Operable and maintainable by design

Persistent workflows MUST have bounded cost/time, cancellation, retries, and
observable failure states. Secrets and customer content MUST be excluded from Git
and routine telemetry. Migrations MUST be explicit and recoverable. Templates,
metrics, evidence rubrics, and agent behavior MUST be versioned. Reused demo code
MUST be reviewed against the new contracts before adoption.

## Product and technical constraints

The complete product scope is in `docs/product-blueprint.md`. Preserve the visual
language recorded in `docs/design-reference.md`. Use separate preview and
production resources; do not point a new build at the demo's database by default.
The foundation ships governance and planning only. It does not provision cloud
resources, migrate customer data, or certify production readiness.

## Development workflow and quality gates

Follow `CONTRIBUTING.md`: specify → clarify where needed → plan → tasks → analyze
→ implement → verify/converge → PR review → merge. Resolve critical contradictions
before implementing affected behavior. Every PR MUST record relevant checks,
documentation impact, rollout/rollback, and any approved exception. README changes
belong in the same PR when behavior or setup changes; verify freshness after merge.

## Governance

This constitution establishes project policy, subject to explicit user direction.
Amendments require a PR explaining rationale, affected specs, and transition work.
Use semantic versioning: major for incompatible principles, minor for added
governance, patch for clarification. Record exceptions in the relevant plan with
scope, reason, owner, and expiry. Review compliance before and after design.

Version 1.0.0 is proposed for adoption with the foundation PR. Ratification is
pending that merge; its merge date will establish the ratification date.

**Version**: 1.0.0 | **Last Amended**: 2026-09-26
