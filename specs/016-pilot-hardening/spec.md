# Feature Specification: Production Hardening

**Feature Branch**: `016-pilot-hardening`

**Created**: 2026-10-10

**Status**: Production hardening retained; private pilot programme cancelled by user direction.

## Context and current scope — 2026-10-31

016 retains production authorization and owner privacy, durable private storage,
bounded processing jobs, retention/deletion, cost controls, operational health,
backup/recovery, explicit migrations/runtime grants and exact-version release checks.
Meaningful deterministic, integration and authenticated hosted checks remain applicable
when they establish changed production behavior.

The private/synthetic pilot programme is cancelled, not completed. Do not provision
pilot workspaces or participants, expose a Synthetic Pilot production option, collect
participant feedback, or require a private readiness assessor, whole pilot catalog,
repeated SDK/model catalogue, or pilot-owner approval programme to release a valid
production fix. Existing actual evidence and failures retain their original scope;
cancellation does not convert missing or failed checks to passes. Ordinary release
review and production authorization/budget controls remain required. Destructive
checks still use owned isolated fixtures rather than real customer records.

Broader identity-provider onboarding and unrelated business features remain outside
this change. Existing memberships and private-conversation ownership remain enforced.

## User Scenarios & Testing *(mandatory)*

**Work-storage constraint (2026-10-11)**: Backups and independently retained
recovery authority must use work-controlled infrastructure. Personal iCloud and
other personal storage are prohibited. Inspect the existing Neon recovery setup
for database recovery; private files and current denial/replay records require
their own verified protection.

### User Story 1 - Verify a release from current evidence (Priority: P1)

As the release owner, I can see which required journeys passed on the intended
release, which failed or remain unverified, and make a production release decision.

**Why this priority**: A green build has previously masked hosted schema and
workflow failures; the decision needs evidence for the actual deployed product.

**Independent Test**: Review current, stale, missing and failed production evidence; missing positive coverage cannot count as a pass.

**Acceptance Scenarios**:

1. **Given** a proposed release, **When** its evidence is evaluated, **Then** every
   required gate records the source version, environment, method, time and result.
2. **Given** passing empty/denied partner reads but no assigned-record proof,
   **When** release evidence is reviewed, **Then** the positive journey remains unverified.
3. **Given** failed or incomplete mandatory gates, **When** approval is attempted,
   **Then** the release cannot be marked ready; a narrower release requires an
   explicit recorded scope and cannot relabel the failed gate.
4. **Given** a successful pre-merge run, **When** the deployment changes, **Then**
   changed hosted behavior is checked again against the deployed version.

### User Story 2 - Recover without reviving lost authority (Priority: P1)

As the operator, I can restore a consistent saved environment, account for work
that was in flight, and reopen access only after recovery checks succeed.

**Why this priority**: Recovery must preserve reviewed records while keeping revoked
access, withdrawn evidence and uncertain external actions from returning silently.

**Independent Test**: Restore a matched synthetic backup, interrupt and resume the
procedure, then prove data integrity, access denials and bounded recovery time.

**Acceptance Scenarios**:

1. **Given** a matched backup of persistent data and private files, **When** restored
   in isolation, **Then** accepted record history and retained files agree.
2. **Given** revocation or withdrawal after the backup, **When** restoration occurs,
   **Then** access stays closed until current denial information is reapplied or
   affected credentials and sources are conservatively invalidated.
3. **Given** interrupted generation or an uncertain report send, **When** the worker
   resumes, **Then** it reconciles status without duplicate paid work or delivery.
4. **Given** an incompatible or incomplete backup, **When** recovery is attempted,
   **Then** it stops before exposing the restored environment.

### User Story 3 - Enforce access and content lifecycle across the product (Priority: P1)

As an authorized member or data steward, I can rely on the same permissions and
withdrawal/deletion behavior in the application, Turi, jobs, exports and MCP.

**Why this priority**: Read access and retained content span several features and
must remain correct when workers fail, roles change or backups are restored.

**Independent Test**: Exercise positive and negative access for two synthetic
customers and all supported roles, withdraw linked evidence, run existing expiry
policies, restart cleanup, and verify content removal and minimal audit retention.

**Acceptance Scenarios**:

1. **Given** a partner assigned customer A, **When** reading delivery records and
   published shared knowledge, **Then** permitted content is visible and customer B,
   private conversations, workforce and commercial details remain inaccessible.
2. **Given** a withdrawn source or revoked grant, **When** all supported read paths
   run before cleanup, **Then** dependent content is already withheld.
3. **Given** expired content, **When** cleanup is interrupted and resumed, **Then**
   content is purged under its existing policy while replay protections survive.
4. **Given** a deletion request and retained backups, **When** completion is recorded,
   **Then** active-store removal and backup expiry are reported separately.

### User Story 4 - Operate within measured limits (Priority: P2)

As the operator, I know the tested service capacity, quality and cost limits, can
recognize a failing service, and can follow a recovery or disablement procedure.

**Why this priority**: The service needs known bounds and actionable failure signals,
including maintenance failures that are otherwise hidden by successful page reads.

**Independent Test**: Run the bounded synthetic load and failure catalog; verify
latency, quota handling, measured costs, alerts and runbook actions without leaks.

**Acceptance Scenarios**:

1. **Given** the agreed workload, **When** measured under its stated conditions,
   **Then** each operation class meets its threshold or blocks that capacity claim.
2. **Given** a failed worker, unavailable store or unknown provider charge,
   **When** health is evaluated, **Then** the failure is visible and further
   affected work is bounded or stopped without exposing private payloads.
3. **Given** an incident, **When** a second operator follows the runbook,
   **Then** they can identify affected scope, disable it and verify recovery.

### User Story 5 - Verify the production release (Priority: P1)

As the release owner, I verify the actual deployed version, required migrations and
runtime grants, recovery prerequisites, and changed production behavior. Failed or
unobserved checks retain their real status. Participant observations, synthetic
workspace provisioning and pilot feedback are cancelled requirements.

**Independent Test**: Verify target identity and recovery backup, rehearse schema
changes in owned isolation, then use authenticated HTTP and CLI WebKit checks of
changed behavior after deployment, without modifying real user histories.

### Edge Cases

Missing required records; backups with mismatched environment/file versions;
revocations newer than a backup; partial cleanup and unavailable private storage;
expired audit payloads with permanent replay tombstones; source withdrawal while
cleanup is stopped; stale evidence from another commit; nondeterministic timeouts;
quota throttling; unknown paid usage; uncertain sends; inaccessible monitoring;
production data in traces or diagnostics.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Maintain source-bound production regression and release evidence for changed behavior; a private pilot readiness catalog is not a release prerequisite.

- **FR-002**: Bind every gate result to its actual source version, deployed version
  when hosted, environment, schema, execution time and evidence digest. Distinguish
  pass, fail, blocked and unverified; fabricated, skipped or stale proof cannot pass.
- **FR-003**: Retain ordinary accountable release review. Private pilot eligibility/owner-decision machinery is cancelled and cannot grant production authority or replace real authorization, recovery and deployment checks.

- **FR-004**: Preserve existing identity, membership and decision boundaries. Internal visibility never grants another person’s private conversations; broader authentication/onboarding remains deferred.

- **FR-005**: Produce an inventory and repeatable restore procedure for database,
  private originals/derived files, durable workflow state, versions and required key
  references. Keep backup contents and secrets private and environment-bound.
- **FR-006**: Rehearse matched restoration, interruption, integrity verification and
  forward recovery in owned isolation; refuse mismatches before enabling access.
- **FR-007**: Recovery must not silently revive revoked credentials, permissions,
  deleted/withdrawn evidence or expired content, nor duplicate uncertain sends or
  paid work. Reconcile current denial state before reopening; fail closed if absent.
- **FR-008**: Define a recovery objective of at most 24 hours of lost accepted
  work and four hours to verified restricted service; measure a full drill and
  verify the backup cadence needed to support those objectives.
- **FR-009**: Inventory and verify existing content-specific retention/deletion
  policies, private files, indexes, cached derivatives, audit payloads and permanent
  replay records. Do not silently shorten or extend previously approved periods.
- **FR-010**: Withdrawal and grant loss must withhold affected content immediately
  across UI, Turi, jobs, exports and MCP, independently of physical cleanup.
- **FR-011**: Verify bounded, idempotent cleanup through outage and restart; record
  active-store removal, remaining minimal audit and backup expiry separately.
- **FR-012**: Complete role/customer/owner isolation, accepted-fact, publication,
  prompt-injection, secret handling and runtime-privilege checks across existing
  interfaces; record and correct exploitable defects before readiness.
- **FR-013**: Demonstrate positive assigned-partner and accepted/published-record
  behavior as well as denial cases. Missing data leaves its gate unverified.
- **FR-014**: Use owned isolated fixtures for destructive, replay, fault and load checks. Do not provision synthetic Production pilot workspaces or manufacture customer facts, grants, learning outcomes or publication decisions for acceptance.

- **FR-015**: Measure a bounded service workload of 25 concurrent sessions, 250 customer
  references and 10,000 eligible evidence passages, including throttled MCP use.
  Report per-class latency, failures, quota waits and actual environment limits.
- **FR-016**: Preserve current quotas and budgets during checks. Separate provider,
  hosting/storage and test costs; unknown cost is not zero. Actual paid evaluation
  needs an explicit applicable budget and independent review where required by its
  governing feature; earlier feature budgets are not automatically reused.
- **FR-017**: Verify current retrieval/citation, abstention, owner and publication
  boundaries using representative existing evaluation catalogs. New agent behavior
  requires fresh applicable actual-model evaluation, not relabeled historical proof.
- **FR-018**: Expose actionable, content-free operational status for deployment,
  schema/grants, storage, worker freshness, cleanup backlog, quotas and costs; include
  correlation, category, timing and ownership without private prompts or credentials.
- **FR-019**: Provide and exercise runbooks for recovery, migration/grants, source
  withdrawal, access revocation, worker failure, budget exhaustion, uncertain sends,
  incident triage, release and rollback/disablement.
- **FR-020**: Cancelled: private participant registration, pilot journey observations and feedback-disposition programme. Preserve historical records privately; no missing observation is a pass.

- **FR-021**: Release must verify the target backup/rehearsal, required migrations
  and runtime grants, compatible deployment order, exact deployed version and
  authenticated changed workflows after merge. No request-triggered schema changes.
- **FR-022**: Keep release approval separate from implementation completion and from
  merge. Document unresolved hosted limits; preserve local configuration/workflow
  state and clean up only owned test resources and merged feature branches.

- **FR-023**: Existing private uploads, workforce files, generated reports and gap
  exports must persist across hosted restarts and instances. Preserve existing size,
  classification, scanning and access limits; temporary scratch space cannot count
  as durable storage. Original and derived content remains private.
- **FR-024**: Hosted extraction, rendering and each retention class must have bounded,
  authorized execution, cancellation, retry/lease fencing and separate freshness.
  Idle or disabled authoring cannot stop required cleanup. Preserve existing parsers
  and templates; do not execute untrusted file instructions or formulas.

- **FR-025**: Preserve server-bound session membership, current grants and the existing primary workspace default. Do not expose or provision a Synthetic Pilot production option; selection never creates membership or authority.

### Key Entities

- **Release evidence index**: Applicable production checks, owners and measured limits.
- **Gate evidence**: Result, method, environment/version binding and private proof.
- **Recovery manifest**: Matched persistent components, key references, timings,
  integrity and authority-reconciliation results; never plaintext credentials.
- **Lifecycle inventory**: Content class, governing policy, stores, denial/purge and
  backup behavior, retained audit identity and responsible operator.
- **Operational control**: Environment recovery fence and per-class worker health;
  opaque private-object identity and bounded execution metadata.
- **Release decision**: Exact catalog/evidence binding, scope, blockers, exclusions,
  accountable owner and time; cannot manufacture missing evidence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Applicable changed-behavior release checks have attributable results; missing, failed or stale proof is not a pass. The cancelled private catalog is not a release gate.
- **SC-002**: A complete interrupted-and-resumed recovery drill meets the 24-hour
  loss/four-hour recovery objectives with zero integrity or authority violations.
- **SC-003**: Every inventoried content class has a tested withdrawal/expiry outcome;
  all cross-customer, owner-private and unauthorized partner probes disclose zero
  protected records, and interrupted cleanup preserves replay protection.
- **SC-004**: At the defined load, 95% of ordinary reads finish within two seconds,
  95% of eligible MCP reads within one second, and unexpected failures stay below
  1%; expected quota denials/waiting are reported separately, never hidden.
- **SC-005**: Every supported failure category produces a content-free actionable
  status, and an operator detects a stopped worker within five minutes.
- **SC-006**: Changed hosted behavior has applicable positive and boundary evidence for its roles; missing production evidence cannot count as completion. No universal pilot catalogue is required.
- **SC-007**: Production defects have an owner and a verified correction or an explicit unresolved status. The participant-feedback approval programme is cancelled.
- **SC-008**: Every release has target schema/grant and exact-version post-merge
  evidence; zero customer data, credentials or private backups enter tracked artifacts.

- **SC-009**: Existing maximum-size permitted uploads and generated artifacts remain
  retrievable after hosted restart and across instances; unauthorized reads disclose
  zero bytes, and all required processing/cleanup classes demonstrate completion.

  Generated-byte retention may be established compositionally: actual normal
  reviewed 40-slide rendering/publication and full report reads, actual exact
  10 MiB original reads through the same deployed `BlobPrivateObjects` byte
  implementation and physical store, both after the same actual new deployment,
  plus current-source exact-boundary report-wrapper/common-adapter contract tests.
  Record the shared implementation/configuration identities and all actual sizes.
  Label the result as a shared-adapter inference, with `actualReportAt10MiB:false`;
  this does not assert maximum renderer byte output. Current authorization,
  withholding and all required processing/cleanup checks remain mandatory.

- **SC-010**: All session, direct-ID, retrieval, publication, metrics, job and MCP
  cross-workspace probes preserve the selected membership; no test outputs enter real customer results or outcome statistics.

## Assumptions

- 002–015 are the implementation baseline; readiness evidence has differing local,
  actual-model, CI and hosted scope. Existing evidence is indexed with honest limits.
- `mcteer` remains the operational/release owner. Security review is an engineering
  assessment of the changed production platform, not an external certification or compliance claim.
- Recovery and load numbers are conservative planning targets, to be measured and
  recorded; they are not current service guarantees or claims of hosted capacity.
- Existing retention policies and human decision rights remain authoritative.
- New identity providers, billing, general onboarding, new delivery capabilities,
  ticket connectors and automated external sends are outside the default scope.
- Implementation may repair failures of these gates with targeted regression tests.
  Unrelated features or policy changes require their own specification.
- This planning run does not start paid evaluations, create the pilot workspace or change production records,
  assign partners, deploy, merge, or delete retained customer information.


### Quality-review clarification — 2026-10-13

mcteer explicitly requested another LLM as the independent semantic judge. Use a
separate judge with the exact actual-output captures, available tool/fixture evidence
and each governing rubric; record its model identity, capture digests, per-case
scores, rationale and uncertainties. The target Turi model remains unchanged.
Uncertain or failed cases stay failed/pending.

The T163 catalog correction changes only the registered title of the existing
strengthened artifact test. All 1,041 cases, 189 suites and acceptance criteria
remain required; the `547322b` incomplete catalog is not a complete pass.

The T164 test-harness correction preserves the automatic post-reload receipt
scenario by preventing the preceding document from consuming that receipt.
It changes no application behavior, authorization rule or acceptance threshold.
The separately reproduced fixture race does not establish the original CI cause.

The T165 CI orchestration correction runs all four execution WebKit projects in
parallel, retaining all 60 cases and their original isolated environments and
limits. The aggregate acceptance status requires every project and execution
core gate to succeed. It does not turn the cancelled `a67cc81` run into a pass.

### In-flight refresh deadline (2026-10-24)

Background product-gap polling must preserve an active read's bounded deadline.
A periodic poll cannot cancel that read and start its deadline again. Explicit
user refresh and access-change events may supersede an older read. Confirmed
commands remain retired while refreshed eligibility is unavailable; timeout
recovery performs reads without replaying the committed command.


### Release observation directive — 2026-10-24

The user directed that release must not wait 12 or more hours for backup
observations. Release still requires a fresh actual encrypted backup, an actual
isolated restore with the governed checks, and an enabled stable recurring
schedule. Two genuinely spaced scheduled captures remain unobserved until actual
evidence exists. Preserve the original assessor result; do not fabricate or
synthesize elapsed cadence. Runtime 12-hour minimum spacing, 24-hour freshness,
seven-day retention, protected archives/keys, denial reconciliation and recovery
objectives remain unchanged. This exception concerns release observation only.
