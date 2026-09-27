# Decision register

These decisions distinguish a useful planning default from an approved operational
configuration. Owners below are roles to assign, not invented named approvals.

| ID | Decision / default | Status | Resolve by / accountable role |
| --- | --- | --- | --- |
| D01 | eve at core; preserve selected root model | User requirement / preserved | Foundation |
| D02 | GitHub Spec Kit 1.0.12, Codex skills, explicit Git branches, sequential specs | Configured | Foundation review |
| D03 | One Next.js/eve app, managed Postgres and private Blob, scoped domain services | Proposed | 002 / technical lead |
| D04 | Internal identity provider, partner federation, invitation/offboarding and MFA policy | Open; block access implementation choices | 002 / identity owner |
| D05 | Workspace/customer grants, partner projects, field visibility, context/plan/staffing approvers | Open; proposed roles in blueprint | 002 / product and security owners |
| D06 | Database provider, region, resource ownership, cost envelope and preview isolation | Open; Neon candidate, no provisioned resource | 002 / platform owner |
| D07 | Data classification, retention, deletion, residency and permitted model processing | Open; private scoped storage default | Before private-data pilot / data owner |
| D08 | Supported file types/limits, scanning and OCR provider; competency taxonomy | Proposed formats in roadmap | 004/007 / delivery operations |
| D09 | Evidence-quality-v1 weights, freshness and thresholds | Proposed, needs calibration | 005 / knowledge steward |
| D10 | Delivery and maturity rubrics; templates and financial formulas | Proposed from reference review | 003/006/007 / delivery lead and finance |
| D11 | Approved Vercel brand assets, slide master, report recipients and sender/provider | Open; no mail connector installed | 009 / communications and account owner |
| D12 | Pilot customer/workload set, scale, SLOs, recovery targets and budget | Open; use synthetic acceptance fixtures first | Set per feature; finalize 016 / product and platform leads |
| D13 | Cross-customer learning consent, suppression and publication authority | Proposed separate contribution review | 012/014 / data and knowledge owners |
| D14 | First MCP consumers, issuer, scopes and quotas | Open; read-only default | 015 / platform and security leads |
| D15 | Migration from demo | No bulk migration planned; explicit later spec if needed | Product owner |
| D16 | Integrations are added only when actively used and tested | Explicit user requirement | Every feature |
| D17 | No coding-harness authorship attribution in commits, PRs or authored artifacts | Explicit user requirement | Every contribution |
| D18 | Align the existing Git-connected Vercel project's Next.js expectation with the actual new web app; confirm target project/domains before release | Observed automatic preview failure; no settings changed | 002 / platform owner |

None of the open choices prevents review of the foundation. Resolve the relevant
entry at the feature's planning gate, record alternatives and rationale, and add
an architecture decision file for a substantial change. Do not select paid resources
or broaden data sharing just to clear this register.
