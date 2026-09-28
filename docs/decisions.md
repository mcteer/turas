# Decision register

These decisions distinguish a useful planning default from an approved operational
configuration. Owners below are roles to assign, not invented named approvals.

| ID | Decision / default | Status | Resolve by / accountable role |
| --- | --- | --- | --- |
| D01 | eve at core; preserve selected root model | User requirement / preserved | Foundation |
| D02 | GitHub Spec Kit 1.0.12, Codex skills, explicit Git branches, sequential specs | Configured | Foundation review |
| D03 | One Next.js/eve app with scoped domain services and explicit Postgres migrations; local Postgres 17 is implemented, while hosted storage and private Blob remain future choices | Local 002 implementation; hosted design open | 002 / technical lead |
| D04 | Use `panel`, `mcteer` and `partner` demo logins for 002; full authentication, internal identity provider, partner federation, onboarding and MFA deferred until explicitly resumed following hiring | User-directed 2026-09-27; retain authorization boundaries and fixture tests | 002 demo login / future identity owner |
| D05 | In 002, `mcteer` represents internal Vercel admins/FDE/PS leadership; `panel` represents internal employees; `partner` represents an external partner member. Only mcteer administers access. Internal employees can view every workspace customer profile, including non-delivery use; partner assignments expose only delivery-relevant information for a limited customer subset. All three have private chat histories. Partner project/field visibility and business approvers remain for their feature specs | Demo authority confirmed 2026-09-27; later business roles open | 002 and subsequent workflow specs / product owner |
| D06 | Local Postgres 17 for 002; Neon selected for future hosted domain storage with isolated databases, runtime/migration roles and us-east-1/iad1 default | 002 design selected; hosted resource assignment/cost configuration deferred, no provisioning | 002 local setup / future hosted platform owner |
| D07 | Initial demo permits synthetic customer data and public research only. Private real-customer data is deferred; classification, retention, deletion, residency and permitted model processing must be resolved before that rollout | Demo data scope confirmed 2026-09-27; private-data policy open | Before private-data pilot / data owner |
| D08 | 004 implements local PDF/DOCX/PPTX/XLSX/CSV/TXT/MD/PNG/JPEG intake, 5 files/message, 10 MiB each/25 MiB total, real ClamAV and offline English OCR in isolated local containers, and a private local store. Exact format/job limits and dependency decisions are in the 004 contracts. Hosted Blob/Sandbox adapters are deferred; competency taxonomy remains 007 | Local 004 implementation under validation; original visibility uses an explicit unconfirmed conservative default | 004/007 / delivery operations |
| D09 | Evidence-quality-v1 weights, freshness and thresholds | Proposed, needs calibration | 005 / knowledge steward |
| D10 | Delivery and maturity rubrics; templates and financial formulas | Proposed from reference review | 003/006/007 / delivery lead and finance |
| D11 | Approved Vercel brand assets, slide master, report recipients and sender/provider | Open; no mail connector installed | 009 / communications and account owner |
| D12 | Pilot customer/workload set, scale, SLOs, recovery targets and budget | Open; use synthetic acceptance fixtures first | Set per feature; finalize 016 / product and platform leads |
| D13 | All active platform users, including partners, can use reviewed shared practices/solutions without source-customer access or attribution. Publish sanitized revisions with restricted lineage; customer assignments expose delivery-relevant information only. Cohort suppression applies separately to aggregates, not individual reusable solutions | Shared access policy confirmed 2026-09-27; publication workflow/roles specified in 005 | 003 field visibility; 005/006 shared retrieval/guidance; 012/014 aggregates/learning |
| D14 | First MCP consumers, issuer, scopes and quotas | Open; read-only default | 015 / platform and security leads |
| D15 | Migration from demo | No bulk migration planned; explicit later spec if needed | Product owner |
| D16 | Integrations are added only when actively used and tested | Explicit user requirement | Every feature |
| D17 | No coding-harness authorship attribution in commits, PRs or authored artifacts | Explicit user requirement | Every contribution |
| D18 | Repository disconnected from Vercel by user; no automatic/manual deployment or reconnection until replacement readiness. Validate 002 through root npm run dev; align project/build/domains and verify hosted behavior at the later release gate | User-directed 2026-09-27; prior automatic preview failure is historical | Replacement readiness / platform owner |
| D19 | eve dev quarantines active Workflow runs from prior development generations. Keep acknowledged records and deadlines in Postgres, never redispatch an uncertain turn, and surface an unconfirmed overdue attempt for operator review. Completed-turn reads and the unconfirmed-deadline restart passed locally; active provider-run resumption is not claimed. Verify hosted restart behavior before replacement readiness | Observed local 002 runtime limit; safe fallback implemented | 002 local acceptance / replacement readiness owner |

None of the deferred hosted or later-feature choices prevents local implementation of 004. Resolve the relevant
entry at the feature's planning gate, record alternatives and rationale, and add
an architecture decision file for a substantial change. Do not select paid resources
or broaden data sharing just to clear this register.
