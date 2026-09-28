# Turas delivery roadmap

Baseline: 2026-09-26; updated 2026-09-27. **001 merged in PR 1; 002 merged in
[PR 2](https://github.com/mcteer/turas/pull/2) after local and CI validation, without a hosted release. 003 merged in [PR 4](https://github.com/mcteer/turas/pull/4) after local and CI validation, without a hosted release. 004 is in planning with implementation not started; 005–016 remain planned.**

The user disconnected the repository from Vercel. Use local `npm run dev` testing;
no reconnection or deployment until replacement readiness. Hosted acceptance for
002 is deferred to that release gate. See the [002 plan](specs/002-identity-platform-shell/plan.md).
Numbers reserve the intended sequence. Create detailed Spec Kit artifacts only
when starting a slice; do not turn the entire product into one implementation PR.
Each slice may need several PRs. No calendar dates are promised before team
capacity, identity/resource choices and initial delivery velocity are known.

## Build sequence

| Spec | Slice | Dependencies | Deliverable and exit evidence |
| --- | --- | --- | --- |
| 001 | Platform foundation | None | Spec Kit, governance, reference audit, blueprint, architecture, templates and roadmap; reproducible checks; reviewed foundation PR |
| 002 | Identity, persistence and application shell | 001 | Next.js/eve shell matching reference; explicit migrations; internal/partner principals and customer grants; owned chat sessions; deny unauthorized stream/resume/control and cross-tenant access |
| 003 | Customer profiles, maturity and context review | 002 | Rich canonical profiles with internal-wide visibility and partner delivery-only projections, separate maturity/delivery models, product-use records, research/risk history; pending → approve/reject/correct/retract lifecycle; accepted-only context tests |
| 004 | Chat attachments and artifact ingestion | 003 | Private original files, explicit customer binding, PDF/DOCX/PPTX/XLSX/CSV/text and image paths, extraction status and review queue; retry/idempotency, deletion and malicious-file tests |
| 005 | Governed RAG, research and evidence quality | 004 | Hybrid scoped retrieval with page/sheet/cell citations, reviewed sanitized shared practices/solutions available to all active users, private source lineage, quality rubric v1, recon/practices/implementation research boundaries, refresh and contradiction handling; retrieval and citation evals |
| 006 | Delivery plans and technical designs | 005 | Versioned template, authorized customer context plus eligible shared practices, architecture artifacts and rationale; accept exact version into customer, milestone baseline and revisions; no duplicate engagement on retry |
| 007 | Skills, staffing and services operations | 006 | Approved structured competency import, availability and constraints, explained matches, manager-confirmed allocations, deterministic utilization/economics; overload and stale-competency tests |
| 008 | Engagement execution and delivery logs | 006, 007 | Milestones, activity/time approval, RAID, scope changes, decision/acceptance/handoff records and outcomes; logs drive status without inventing progress |
| 009 | Weekly and executive reporting | 008 | Reviewed weekly report and recipient policy; monthly/quarterly executive PDF and editable QBR slides; brand/template validation, audience redaction, durable send/retry receipts |
| 010 | TAM and support guidance | 005, 008 | Customer-scoped support readiness, recommended actions, evidence, owner and escalation boundaries; track disposition without pretending to resolve tickets |
| 011 | Product expansion opportunities | 006, 008 | Explainable new-product/usage-expansion hypotheses, prerequisites and proposed engagement; account-owner qualification, dismiss/defer tracking; evidence of customer benefit |
| 012 | Product gaps and engineering feedback | 005, 008, 009 | Canonical gap records, deduplication and unique-customer impact; detailed and summary report templates; restricted aggregates and engineering handoff receipts |
| 013 | Partner delivery and enablement | 006, 008, 010 | Partner workspace for assigned-customer delivery data plus platform-wide published shared knowledge, same plan method plus what/how/why lessons and checkpoints; no internal margins or ungranted customer leakage |
| 014 | Governed adaptive learning | 005, 009, 012, 013 | Extend the 005 shared-knowledge publication path: feedback → reviewed practice candidate → evaluated version → publication/rollback; refresh jobs, cohort privacy, lineage-based invalidation and quality dashboards |
| 015 | Read-only MCP service | 003, 005, 006, 009 | Versioned profile/evidence/plan/report reads through shared policy; scopes, pagination, current authorization, rate limits and consumer contract tests |
| 016 | Pilot hardening and launch readiness | 002–015 | Restore/recovery, retention/deletion, security/access review, scale/cost tests, operational runbooks, pilot feedback and approved release |

## Milestones and review gates

**M0 — Development foundation (001).** Review this plan, merge the foundation PR,
then choose the coding model and begin 002. No product implementation starts merely
because the roadmap is present. Confirm foundation CI and README on merged `main`.

**M1 — Trusted context and planning (002–006).** Demonstrate one synthetic customer
from authorized conversation through document review, cited retrieval and accepted
plan. Unauthorized sessions and draft/retracted evidence must fail closed. Partners'
identity/grant boundaries already exist, even though their enablement UX comes later.

**M2 — Internal delivery pilot (007–011).** Demonstrate skill-aware staffing,
approved work logs, weekly report delivery, executive review, TAM handoff and an
evidence-backed expansion hypothesis. Require a pilot data owner and measured
retrieval/agent quality and operating costs before private customer use.

**M3 — Partner and organizational learning (012–015).** Demonstrate authorized
partner delivery, recurring product-gap evidence, reviewed practice improvement
and an MCP client using the same permissions. No raw cross-customer learning pool.

**M4 — Release readiness (016).** Meet agreed recovery, deletion, performance,
quality, and support criteria. A merged feature is not automatically a production
release. Production rollout is a distinct, reviewable action using eve.

## Dependencies and opportunities to overlap

```mermaid
flowchart LR
  A[001 Foundation] --> B[002 Identity and shell]
  B --> C[003 Profiles and review]
  C --> D[004 Artifacts]
  D --> E[005 RAG and research]
  E --> F[006 Plans]
  F --> G[007 Staffing]
  G --> H[008 Delivery logs]
  H --> I[009 Reports]
  H --> J[010 TAM]
  H --> K[011 Expansion]
  I --> L[012 Product feedback]
  J --> M[013 Partners]
  L --> N[014 Learning]
  M --> N
  I --> O[015 MCP]
  N --> P[016 Pilot hardening]
  O --> P
  K --> P
```

The table is authoritative for all dependencies; the diagram summarizes the main
path. After shared contracts stabilize, 010/011 can progress independently. MCP can
start after 009 without waiting for adaptive learning. Partner access enforcement,
audit, telemetry, testing and recovery are developed throughout; 016 verifies them
under pilot conditions rather than introducing them at the end.

## Current 002 work

Use `panel`, `mcteer` and `partner` demo login for 002, per the 2026-09-27 clarification;
full authentication and partner federation are deferred until explicitly resumed
following hiring. Preserve authorization boundaries and partner fixture tests.
Account roles and grants, isolated Postgres migrations, the private conversation
path, the reference-style shell and local worker are merged, with completed
[002 tasks](specs/002-identity-platform-shell/tasks.md) and
[validation evidence](specs/002-identity-platform-shell/validation.md).
Confirm the target Vercel project/domains, align the
Next.js build and validate hosted behavior only at replacement readiness (D18).
The foundation's earlier preview failure is historical; the repo is now disconnected.

## Completed 003 work

The [003 specification](specs/003-customer-profile-review/spec.md) defines rich
customer/workload profiles, independent maturity assessments, governed context
review, evidence quality and partner delivery-only projections. Clarification is
recorded in the spec. The [implementation plan](specs/003-customer-profile-review/plan.md),
research, data model, interface contracts and validation guide are complete.
The [task breakdown](specs/003-customer-profile-review/tasks.md) is generated;
analysis findings have been remediated. Typed profile and review flows, bound
customer context, synthetic research, conflict review and partner projections
have passed local domain, HTTP and four-project WebKit checks. Guarded 006 upgrade
and restored-clone drills also pass. A guarded 25-record synthetic walkthrough
fixture is ready. The feature merged in [PR 4](https://github.com/mcteer/turas/pull/4).
The scripted populated-profile journey passed in all four WebKit projects.
Validation evidence is recorded in the [003 validation log](specs/003-customer-profile-review/validation.md).
Hosted validation and release remain deferred until replacement readiness.

## Current 004 work

The [004 specification](specs/004-chat-artifact-ingestion/spec.md),
[plan](specs/004-chat-artifact-ingestion/plan.md), research, data model and contracts
are prepared. The [64-task breakdown](specs/004-chat-artifact-ingestion/tasks.md)
orders private local intake and isolated scan/extraction, selected evidence review,
unverified chat context, and versioned source lifecycle/cleanup. All implementation
tasks remain unchecked. The conservative original-file visibility default is
explicitly recorded as an unconfirmed planning assumption. No dependencies,
integrations, migrations or runtime behavior were changed during planning.

Hosted Blob/Sandbox adapters, RAG and competency import remain later work. Local
acceptance will use real synthetic scan/parser fixtures, access/race tests, CLI
WebKit and bounded agent evaluations, without a participant-count gate.

## Updating this roadmap

Record a slice as in progress when its spec/plan exists, and complete only when
its exit evidence and merged PR are linked. Distinguish local, CI, preview and
production verification. Revise dependencies and scope when evidence changes.
Update README in each relevant PR and verify it after merge.
