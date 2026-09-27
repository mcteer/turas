# Turas product blueprint

Status: proposed product baseline for the fresh build, 2026-09-26. None of the
capabilities below is implemented by the foundation PR. See [roadmap](../ROADMAP.md)
for delivery order and [architecture](architecture.md) for technical boundaries.

## Purpose and primary journey

Turas helps Vercel FDE, Professional Services, TAM, account teams, and authorized
partners move customers toward measurable capability and sustainable ownership.
Turi is the eve assistant. The primary loop is:

1. Resolve the customer and workload; establish objectives, products, constraints,
   maturity, risks, and evidence quality.
2. Collect and approve customer context; retrieve relevant artifacts and current
   product practices with source citations.
3. Propose a repeatable delivery plan, explain why it fits, and accept a version
   into the customer profile.
4. Match skills and capacity, confirm staffing, deliver against milestones, and
   record work, decisions, risk, effort, and outcome evidence.
5. Publish reviewed weekly updates and executive reviews; hand over operations.
6. Identify appropriate support, expansion, product feedback, and reusable learning.

## Users and authority

| Role | Primary work | Boundary |
| --- | --- | --- |
| Platform administrator | Identity, workspaces, policy and integrations | Administration is not blanket access to customer content |
| Customer context steward | Review claims, reconcile conflicts and corrections | Review only assigned customer scopes; record rationale |
| FDE/PS lead or engineer | Plan and deliver; log work; propose staffing | No implicit commercial or staffing approval |
| Resource manager | Skills, allocations, utilization and forecasts | Restricted cost/rate and personnel visibility |
| Account team / TAM | Outcomes, support readiness, risk, expansion | Customer grants and audience-specific fields |
| Executive / delivery leader | Authorized portfolio and status review | Aggregates must not leak restricted accounts |
| Partner lead / engineer | Assigned customer planning, execution, enablement | Explicit customer/project grants; internal notes and margins hidden |
| MCP consumer | Query authorized structured context | Read-only scopes; same domain policy as the application |

Exact identity provider and permission matrix are resolved in feature 002. Customer
recipients initially receive authorized reports; customer self-service login is a
separate future scope, not an assumption of the partner portal.

## Requirements and traceability

| ID | Capability and acceptance contract | Roadmap slice |
| --- | --- | --- |
| TR-01 | FDE/PS operations: approved competency matrix, dated availability, skill/level match explanations, tentative/confirmed allocations, timezone/region and leave constraints; deterministic billable/nonbillable time, utilization and forecast variance | 007, 008 |
| TR-02 | Delivery guidance: context-grounded plan and technical design in a fixed versioned template; alternatives, milestones, dependencies, risk and handoff; accept an exact revision once into the selected customer and track it | 005, 006, 008 |
| TR-03 | Expansion: explain cross-sell and expansion hypotheses using documented product use, outcomes, constraints and engagement fit; rank transparently, qualify with account owner, record dismissals and re-evaluate on new evidence | 011 |
| TR-04 | Reports: weekly updates from delivery logs to approved recipients; monthly/quarterly executive report with Vercel branding, standalone PDF and QBR-ready editable slides; template/version, source lineage, review and delivery history | 009 |
| TR-05 | TAM guidance: high-level next actions, readiness checks, risk/escalation triggers and customer operating ownership appropriate to the assessed maturity and active engagements | 010 |
| TR-06 | Product feedback: evidence-backed gap registry with deduplication, product/version, severity, workaround and unique affected-customer counts; detailed feature report and portfolio summary for engineering | 012 |
| TR-07 | Partner enablement: assigned-customer access to the same plan method, rationale and evidence; explain what/how/why, prerequisites, alternatives and validation; training checkpoints and escalation path | 013 |
| TR-08 | Adaptive learning: score evidence age and reliability, preserve conflicting evidence, review and version improved practices, evaluate before release, invalidate dependent recommendations on source changes | 005, 014 |
| TR-09 | MCP: publish versioned, scoped read tools/resources for profiles, maturity, approved evidence, engagements and reports; pagination, citations, audit, rate limits, revoked-grant enforcement | 015 |
| TR-10 | Profiles: canonical customer and workload identity, stakeholders, maturity dimensions/history, product usage and scope, past/current/future engagements, research, risks, decisions, outcomes and next reviews | 003 |
| TR-11 | Context validation: user claims, links and artifacts enter a pending review state; only an authorized decision promotes them to accepted fact. Independent research may attach as attributed evidence with dates and quality | 003, 004, 005 |
| TR-12 | RAG: original documents, versioned extraction, source-location citations and permission-filtered retrieval; competency spreadsheets preserve rows/sheets/cells and become approved structured skill records | 004, 005, 007 |
| TR-13 | Development: GitHub Spec Kit, constitution, AGENTS, contribution guide, PR template, README freshness and reviewable feature increments | 001 |
| TR-14 | Chat: durable conversations, customer selection, resumable streams, artifact attachments, ingestion status and visible pending/accepted context | 002, 004 |
| TR-15 | Visual continuity: retain the demo's restrained Geist-based interface, sidebar, chat composition, cards and evidence tables; accessible light/dark responsive views | 002 and every UI slice |

## Customer maturity model v1 — proposed

Keep the demo's useful maturity stages: **Explore, Activate, Accelerate, Optimize,
Scale, Transform**. They describe the next capability journey, not a universal
linear ladder. A workload may be advanced in one dimension and unassessed in another.

Assess six dimensions independently: outcome/ownership; delivery/collaboration;
experience/adoption; operational trust; platform/organization; innovation/AI.
Dimension states are **Unknown, Emerging, Established, Measured, Scaled, Adaptive**.
Each state requires cited evidence, a scoped observation window, assessor, model
version, and review date. Unknown remains visible; do not average these labels.

Separately track engagement phases: **Qualify, Discover, Shape, Prove, Promote,
Adopt and hand over, Realize and expand, Close**. Codifying field learning is a
cross-cutting activity. Plan records also have administrative states such as draft,
accepted and superseded; those are neither delivery phases nor maturity stages.

## Additional services operations scope

Include demand intake and qualification; skill taxonomy and competency freshness;
capacity calendars, leave and protected enablement time; tentative versus confirmed
bookings; baseline estimates and estimate-to-complete; time approval; scope/change
control; RAID (risks, assumptions, issues, dependencies); decision and acceptance
logs; rate cards/currency; contribution forecasts; write-off and billing-readiness
signals; partner allocations; handoff and closeout retrospectives.

Proposed metrics must expose period, timezone, unit and formula version:

- Available hours = contracted working hours minus holidays and approved leave.
- Schedulable remaining = available hours minus confirmed allocations and protected
  non-delivery hours. Negative results flag overload; never silently clamp them.
- Actual billable utilization = approved billable hours / available hours. Report
  planned allocation separately; zero available hours produces “not applicable.”
- Forecast effort = approved actual hours + current estimate to complete.
- Forecast contribution = contracted services revenue minus allocated delivery and
  nonlabor cost; explain included costs, currency and forecast assumptions.

Finance validates economic definitions in 007. These are proposed operating
policies, not Vercel benchmarks. Payroll, invoicing, revenue recognition, HR
performance scoring, CRM replacement and automated commercial commitments are
outside initial scope. Provide exports/integration seams where needed.

## Product acceptance and measures

The first useful internal slice is an authorized user selecting a customer,
attaching a document, reviewing extracted claims, retrieving accepted evidence,
and accepting a cited plan into that profile (002–006). The operational pilot adds
staffing, logs and report delivery (007–009), then customer-growth/support flows.

Measure profile evidence coverage and overdue review rate; retrieval citation
accuracy and abstention; time to reviewed plan; plan rework; staffing feasibility;
forecast versus actual effort; report preparation time and send reliability;
customer handoff/acceptance and outcome change. Establish baselines in the pilot,
then set targets. Do not claim causal revenue or time savings without measurement.

Release tests must include customer/partner isolation, withdrawn claims, duplicate
approvals, changed plans, conflicting sources, malicious documents, unavailable
providers, retry after partial failure and report audience redaction. Performance,
scale and cost budgets are specified per feature against representative data.
