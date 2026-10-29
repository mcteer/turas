# 016 Research and Decisions

Planning research completed 2026-10-10 against main
`db6c0b9a721fcf5f6311b5be8ecd18846e38a8c9`. This is source/documentation review,
not new hosted acceptance. Two read-only research agents examined recovery and
validation. No dependency, connector, environment or customer data was changed.

## R01 — Controlled pilot and truthful readiness

**Decision**: Internal users and explicitly assigned partners, as clarified by the
user. Maintain a fixed catalog for 002–015 and an explicit evidence bundle. The
checker calculates technical eligibility; it never impersonates `mcteer` or grants
release approval from a string in a JSON file. The accountable human decision is
recorded separately with the exact bundle and scope. Existing server authority
continues to govern each customer/partner/review action.

**Rationale**: ROADMAP.md still defers full authentication/federation. 015's actual
Production evidence proves login/boundaries and research reads, but not positive
assigned-partner or accepted/published-record paths.

**Alternatives**: Broad customer onboarding requires a different authentication
scope. Counting empty reads as positive proof would conceal the known gaps.

## R02 — Reuse domain gates; make evidence selection explicit

**Decision**: Reuse existing complete feature suites and owned harness patterns.
Add a 016 catalog, strict evidence schemas, source identity and explicit run manifest.
No glob search for any historical successful receipt. A failure remains attached to
its attempt; a complete later attempt can supersede it without deleting history.

**Rationale**: `scripts/check-reports-release.ts` validates explicit private inputs;
`scripts/check-execution-release.ts` shows source-bound resume and provider-key
stripping. `scripts/mcp-environment.ts` covers owned databases, runtime-role app
start and cleanup. `scripts/mcp-ci-evidence.ts` scans same-source summaries, which
is insufficient to establish which attempt 016 accepted. Extend
`scripts/execution-source-digest.ts` explicitly for 016; keep prior receipts under
their own feature/version/commit. No old evaluation is relabeled as current.

**Alternatives**: A second implementation of every feature test increases drift.
One aggregate green CI badge omits role, deployment, schema and positive data proof.

## R03 — Matched backup with denied restore

**Decision**: Wrap existing explicit migration and store abstractions with an owner
backup/restore CLI. Inventory database, artifact/workforce/report stores, hosted
workflow persistence and key references. Capture a quiesced or demonstrated
consistent boundary. Restore only into an isolated target with normal traffic,
paid dispatch and deliveries fenced until integrity and authority reconciliation
pass. No automatic Production replacement or in-place restore.

**Rationale**: `scripts/reports-recovery-check.ts` is the strongest matched database,
private-file and workflow-tree pattern. `scripts/mcp-recovery.ts` proves current
schema/grants and restart. Neither proves full-product production recovery or a
regular backup cadence. PostgreSQL documents that a logical dump is consistent for
the database at its start; it does not coordinate separate private files. See
[PostgreSQL SQL dump](https://www.postgresql.org/docs/current/backup-dump.htm).

**Alternatives**: A database-only dump omits originals and workflows. A copied local
`.eve/.workflow-data` directory does not establish hosted Workflow recovery.

**Destination constraint (2026-10-11)**: Personal iCloud and other personal
storage are prohibited for this work tool. Inspect the existing Neon recovery
configuration for database recovery. Files, independently current denial/replay
records and any independent archive must use work-controlled infrastructure.
The personal-iCloud experiment is rejected and supplies no acceptance evidence.

## R04 — Reconcile authority newer than the backup

**Decision**: Preserve a separate private denial/replay reconciliation manifest
outside the backup being restored. Include current membership/grant/session/MCP
revocations, source deletion/withdrawal, expiry and irreversible send/paid-attempt
receipts. If current state cannot be established, revoke restored bearer/session
access and quarantine affected sources and uncertain work; keep those scopes closed.
Do not change accepted history merely to make the restore pass.

**Rationale**: Existing MCP restore proves already-revoked credentials stay revoked.
The report restore drill intentionally demonstrates snapshot fidelity for a record
withdrawn later. That recovered record must be fenced before service resumes.
Original purge deadlines and lifetime replay keys must survive recovery.

**Alternatives**: Trusting a stale snapshot reintroduces authority. Blindly replaying
pending sends or model calls risks duplicate effects and spend. A digest proves
bytes, not current permission.

## R05 — Preserve lifecycle policy; verify actual placement

**Decision**: Produce one lifecycle inventory pointing to governing feature policy
and concrete stores/cleanup functions. Keep original periods; add no blanket chat,
profile or accepted-history TTL. New operational evidence has a separate minimized
retention policy. Backup expiry and active-store purge remain separate statuses.

| Class | Existing policy to preserve | Primary source |
| --- | --- | --- |
| Artifacts | Explicit lifecycle deletion; originals, staging, extracts, selected/generated copies and native retirement | 004 data model; artifact cleanup |
| Research/retrieval | Interrupted raw bodies ≤24h; retired derived payload ≤60s with healthy worker; operational receipts 30d | 005 data model C10; retrieval cleanup |
| Plans | Accepted history has no blanket TTL; previews 10m/removable after 24h; terminal drafting instructions 30d | 006 data model; plans cleanup |
| Workforce | Pending/cancelled/rejected payload 30d; withdrawn purge within 24h of healthy worker; accepted until withdrawn; ≤20 jobs/tick | 007 data model; staffing cleanup |
| Execution | Ineligible payload 30d; immediate withholding; ≤100 jobs/tick | 008 data model; execution maintenance |
| Reports | User-confirmed audit minimization 730d; unmatched signed receipts ≤24h, ≤1,000/environment, ≤100/batch | docs/reporting-operations.md; report-retention-v2 |
| Support/expansion | Invalidated ≤24h; obsolete drafts 90d; assistant payload 30d; audit 365d with referential exceptions; lifetime request fences | docs/support-operations.md; 011 data model |
| Gaps | Invalidated ≤24h; obsolete 90d; export/report 30d; audit 365d then keyed fence; previews 5m | 012 data model; lib/product-gaps/retention.ts |
| Partners | Invalidated ≤24h; obsolete/withdrawn 90d; preview 5m/cursor 15m; audit 365d; permanent request tombstones | docs/partner-operations.md |
| Learning | Obsolete 90d; invalidated ≤24h or earlier source deadline; audit 365d; lifetime tombstones; native payload zero after exact reset receipt | docs/learning-operations.md |
| MCP | Handles ≤15m; usage ≤90d; revoked/expired hashes purged ≤24h; permanent minimal create/revoke identity | docs/mcp-operations.md |

**Alternatives**: Globally resetting retention would conflict with approved feature
contracts. Successful page reads cannot prove all cleanup paths are scheduled.

## R06 — Per-class maintenance readiness

**Decision**: Define one shared registry of bounded cleanup/maintenance classes,
used by the local worker and hosted dispatcher. Reuse actual domain functions and
separate file/extraction/rendering workers from database cleanup. Track per-class
last start/success, lease, finite duration, safe failure category and bounded backlog.
Cleanup remains independently scheduled while feature authoring is disabled.

**Rationale**: `app/api/health/ready/route.ts` currently checks minimum schema 11 and
a 15-second chat-worker heartbeat; `lib/server/db/readiness.ts` defaults to 13.
`lib/server/conversations/hosted-watchdog.ts` runs conversation, learning and MCP;
`scripts/maintenance-worker.ts` includes more domain loops, and
`scripts/reports-worker.ts` handles report/file/gap work. One heartbeat cannot
certify all these classes or current runtime grants.

**Alternatives**: An unbounded all-jobs request would couple failure and latency.
A heartbeat written before a failed cleanup loop falsely suggests healthy retention.

## R07 — Bounded workload and costs

**Decision**: Use 25 synthetic sessions, 250 customer references and 10,000 eligible
passages; sample each read class separately. Preserve quotas and separate natural
quota waiting from admitted-operation latency. Store counts, percentiles, failures,
platform configuration and pricing inputs; unknown cost is explicitly unknown.
Keep provider keys stripped from deterministic/CI/load/recovery runs.

**Rationale**: Existing MCP benchmarks use real SDK reads and quota pacing; feature
benchmarks have different dataset shapes and cannot be called hosted capacity proof.
A single aggregate percentile conceals a failing feature. No paid authorization is
needed for planning; applicable evaluation budgets are admitted later if required.

**Alternatives**: Burst bypasses and synthetic fixed provider charges give misleading
capacity or cost. The 011/014 budgets were feature-specific, not a continuing allowance.

## R08 — Deployment constraints are acceptance requirements

**Decision**: Verify actual durable private storage and hosted worker placement,
including restart and cross-instance access. A writable scratch directory is not
accepted as a persistent store. Hosted workflow evidence must identify the actual
managed backend and supported recovery procedure; use installed eve docs before
any framework work. Storage/worker remediation is part of existing-feature
hardening, with explicit deployment/cost boundaries and no speculative connectors.

**Rationale**: Current artifact/workforce/report stores use private local filesystem
paths. Vercel documents functions' read-only filesystem and temporary scratch space;
its file guide recommends object storage for persistence. See
[Vercel runtimes](https://vercel.com/docs/functions/runtimes) and
[file persistence guidance](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions).
Installed `node_modules/eve/docs/guides/deployment/vercel.mdx` distinguishes managed
Workflow persistence from local files and directs deployments through eve.

**Alternatives**: Treating `/tmp` or deployment files as durable storage can pass one
request and lose data on restart. Backing up only a developer machine proves no
hosted data recovery. New provider installation without an active used contract is
outside the constitution.

## R09 — Private Blob and isolated hosted file jobs

**Decision**: Use a shared private-object interface with explicit local and private
Vercel Blob adapters; keep domain namespaces/authority separate. Use official Blob
SDK APIs for private, uncached reads and authorized direct uploads. Use a bounded
Vercel Sandbox job adapter for existing scanner/parser/renderer artifacts. Keep
local Docker adapters. No model turn or persistent agent sandbox is created for a
file job. Pin reviewed SDK versions during implementation rather than guessing a
version in this plan.

**Rationale**: `ArtifactStore.readPath` and concrete `LocalArtifactStore` callers in
upload/read/runner/cleanup require a stream-based abstraction. Workforce and report
stores need the same transport; gaps share reports. The existing 10 MiB upload
limit exceeds Vercel Functions' 4.5 MB body limit, so authorization must mint an
exact staging-path upload capability and completion must independently validate
bytes, digest, expiry and current authority. Metadata from a callback is not proof.
See [Functions limits](https://vercel.com/docs/functions/limitations),
[private Blob](https://vercel.com/docs/vercel-blob/private-storage) and
[Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk).

Read-only eve registry discovery found `memory/file`, a per-principal agent-memory
integration; it does not implement these domain stores and must not be installed.
Installed eve's Sandbox abstraction is session-owned; a maintenance job uses the
public Sandbox SDK behind the adapter, not private framework imports. Run an
immutable, digest-pinned image, `persistent:false`, denied network, no ports or
secrets and fixed commands. Sandbox ignores image ENTRYPOINT/CMD, so commands are
explicit. Store provider job identity with the durable lease for orphan shutdown.
See [Sandbox images](https://vercel.com/docs/sandbox/concepts/images) and
[Sandbox SDK](https://vercel.com/docs/sandbox/sdk-reference).

**Alternatives**: Reducing upload limits would regress 004/007. A public read URL
bypasses live authorization. Shared persistent sandboxes mix private job data.
A new agent-memory integration solves a different problem.

## R10 — Synthetic Production workspace with bound sessions

**Decision**: The user selected a synthetic Production pilot workspace followed by
real-user feedback. Add explicit workspace membership binding to browser sessions,
with the current primary workspace as the default. Use existing principals and
credentials; the operator creates only distinct pilot memberships/organization and
synthetic customers. Workspace selection never grants membership. Revoke ambiguous
legacy sessions rather than choosing the first joined membership.

**Rationale**: Both `authenticateDemoPrincipal` and `getCurrentSession` currently
join memberships with `LIMIT 1`; adding a second membership without session binding
would make selection nondeterministic. `isCanonicalAdmin` already identifies the
stable mcteer principal, so the same person can review in the pilot workspace using
its own membership. No new identity provider or general onboarding is necessary.
Shared knowledge is platform-wide: synthetic publications need an explicit pilot
eligibility fence at list, retrieval, citation, direct-ID, job and MCP boundaries.
Synthetic populations must remain outside primary learning metrics and gap counts.

**Alternatives**: Mixing pilot records into the primary customer set undermines
operational evidence. Silently treating a second workspace as a second active
membership without session binding breaks authorization. Creating new fake users
cannot prove the existing canonical review paths.

## Implementation dependency verification

Public SDKs pinned to `@vercel/blob` 2.8.1 and `@vercel/sandbox` 3.6.1, both
Apache-2.0; Blob supports Node ≥20 and this project runs Node 24. Registry discovery
was repeated; no domain-store adapter was installed. Existing eve/model selection
is unchanged. The private dependency audit is recorded for the security gate;
pre-existing framework advisories will be assessed against the scoped runtime.
