# Feature Specification: Pilot Hardening and Launch Readiness

**Feature Branch**: `016-pilot-hardening`

**Created**: 2026-10-10

**Status**: Implementation in progress — current-source complete validation, storage/recovery/hosted release and full pilot acceptance remain pending

**Input**: Complete roadmap slice 016: restore/recovery, retention/deletion,
security/access review, scale/cost tests, operational runbooks, pilot feedback and
approved release. Carry forward record-dependent hosted gaps from 002–015 and
validate changed behavior in Production after merge. Implementation is authorized; actual hosted, recovery, quality and participant
proof remain separate required acceptance gates.

## Context and scope

015 is released with authenticated Production read and research/citation evidence.
That does not establish complete delivery workflow readiness. In particular,
assigned-partner and accepted/published-record journeys need positive hosted proof.
016 produces an evidence-backed pilot decision, repairs defects found by its
bounded checks, and supplies repeatable operational procedures for the existing
product. It does not add new delivery features or treat a passed local test as a
hosted result.

The launch audience is an operator-controlled internal and explicitly assigned-partner
pilot. Existing temporary identities remain a documented limitation. Each pilot
participant uses a distinct existing member identity; shared credentials cannot
establish individual review or private-conversation ownership. Broader customer
onboarding and authentication/federation remain deferred.

## Clarifications

### Session 2026-10-10

- Q: Who should 016 make Turas ready for? → A: Controlled internal and
  assigned-partner pilot; broader authentication and onboarding remain deferred.
- Q: Which records should prove the missing Production workflows? → A: A clearly
  labeled synthetic Production pilot workspace using normal reviews and explicit
  partner assignments, followed by separately recorded automated role observations per the 2026-10-19 directive.

## User Scenarios & Testing *(mandatory)*

**Work-storage constraint (2026-10-11)**: Backups and independently retained
recovery authority must use work-controlled infrastructure. Personal iCloud and
other personal storage are prohibited. Inspect the existing Neon recovery setup
for database recovery; private files and current denial/replay records require
their own verified protection.

### User Story 1 - Decide readiness from current evidence (Priority: P1)

As the release owner, I can see which required journeys passed on the intended
release, which failed or remain unverified, and make a scoped pilot decision.

**Why this priority**: A green build has previously masked hosted schema and
workflow failures; the decision needs evidence for the actual deployed product.

**Independent Test**: Supply current, stale, missing and failed evidence; readiness
must distinguish them and refuse to call missing positive coverage a pass.

**Acceptance Scenarios**:

1. **Given** a proposed release, **When** its evidence is evaluated, **Then** every
   required gate records the source version, environment, method, time and result.
2. **Given** passing empty/denied partner reads but no assigned-record proof,
   **When** readiness is computed, **Then** the positive journey remains unverified.
3. **Given** failed or incomplete mandatory gates, **When** approval is attempted,
   **Then** the release cannot be marked ready; a narrower pilot requires an
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

As the operator, I know the tested pilot capacity, quality and cost limits, can
recognize a failing service, and can follow a recovery or disablement procedure.

**Why this priority**: A pilot needs known bounds and actionable failure signals,
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

### User Story 5 - Complete and learn from a controlled pilot (Priority: P2)

As the pilot owner, I can walk through real hosted workflows, collect attributable
feedback, resolve release blockers and approve only the scope actually validated.

**Why this priority**: Passing automation is necessary but does not prove the
product meets an operator's and assigned partner's delivery needs.

**Independent Test**: Run the hosted catalog with authorized pilot participants
and records, record each outcome and feedback disposition, then issue a decision.

**Acceptance Scenarios**:

1. **Given** authorized records and reviewers, **When** the profile → evidence →
   accepted plan → delivery → report journey runs, **Then** each review and result
   is attributable, and no fixture is represented as a real customer outcome.
2. **Given** an assigned partner, **When** delivery, training and MCP reads run,
   **Then** positive access, denied access and revocation are all proven.
3. **Given** pilot feedback, **When** triaged, **Then** it has an owner, severity,
   disposition and evidence; release blockers require correction and recheck.
4. **Given** a merged change, **When** released, **Then** required schema/grants and
   the deployed version are verified before the affected hosted checks are closed.

### Edge Cases

Missing records or participants; backups with mismatched environment/file versions;
revocations newer than a backup; partial cleanup and unavailable private storage;
expired audit payloads with permanent replay tombstones; source withdrawal while
cleanup is stopped; stale evidence from another commit; nondeterministic timeouts;
quota throttling; unknown paid usage; uncertain sends; inaccessible monitoring;
production data in traces; pilot feedback containing private customer material.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Maintain a versioned readiness catalog covering 002–015, with required
  journeys, role/environment coverage, named owner and observable pass criteria.
- **FR-002**: Bind every gate result to its actual source version, deployed version
  when hosted, environment, schema, execution time and evidence digest. Distinguish
  pass, fail, blocked and unverified; fabricated, skipped or stale proof cannot pass.
- **FR-003**: Only the release owner `mcteer` may approve a scoped launch decision.
  The readiness checker computes eligibility; a file claiming an owner name cannot
  grant approval. Preserve the separate attributable human decision.
  Every mandatory gate for that scope must pass; exclusions retain their real state
  and cannot conceal a core authorization, data-loss or deletion failure.
- **FR-004**: Preserve the existing identity and decision boundaries for the controlled
  internal/assigned-partner pilot; broader authentication/onboarding remain deferred.
  Internal visibility never grants another person's private conversations.
- **FR-005**: Produce an inventory and repeatable restore procedure for database,
  private originals/derived files, durable workflow state, versions and required key
  references. Keep backup contents and secrets private and environment-bound.
- **FR-006**: Rehearse matched restoration, interruption, integrity verification and
  forward recovery in owned isolation; refuse mismatches before enabling access.
- **FR-007**: Recovery must not silently revive revoked credentials, permissions,
  deleted/withdrawn evidence or expired content, nor duplicate uncertain sends or
  paid work. Reconcile current denial state before reopening; fail closed if absent.
- **FR-008**: Define a pilot recovery objective of at most 24 hours of lost accepted
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
- **FR-014**: Use synthetic owned environments for destructive, replay, fault and
  load checks. Hosted validation uses the separately marked synthetic Production pilot workspace
  with explicit assignments and ordinary reviews, then separately recorded automated role
  observations per the 2026-10-19 directive. Synthetic outcomes never count as actual customer outcomes; never invent
  customer facts, grants, learning outcomes or publication decisions to pass a gate.
- **FR-015**: Measure a bounded pilot workload of 25 concurrent sessions, 250 customer
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
- **FR-020**: Record pilot participants, authorized record scope, journey outcomes
  and feedback disposition privately; publish only minimized readiness evidence.
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

- **FR-025**: Isolate the synthetic pilot workspace using explicitly selected,
  server-bound session membership and current grants. Preserve the existing primary
  workspace default. Pilot records, shared publications and metrics cannot appear
  as primary customer data or real outcomes. Selection creates no membership or grant.

### Key Entities

- **Readiness catalog**: Versioned required gates, scoped audience, owners and limits.
- **Gate evidence**: Result, method, environment/version binding and private proof.
- **Recovery manifest**: Matched persistent components, key references, timings,
  integrity and authority-reconciliation results; never plaintext credentials.
- **Lifecycle inventory**: Content class, governing policy, stores, denial/purge and
  backup behavior, retained audit identity and responsible operator.
- **Pilot workspace**: Explicit synthetic classification, distinct memberships,
  assigned synthetic customers and isolated publication/measurement scope.
- **Pilot record**: Authorized participants/scope, observed journeys and feedback.
- **Operational control**: Environment recovery fence and per-class worker health;
  opaque private-object identity and bounded execution metadata.
- **Release decision**: Exact catalog/evidence binding, scope, blockers, exclusions,
  accountable owner and time; cannot manufacture missing evidence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every catalog gate has an attributable result; 100% of mandatory gates
  pass before the named scope is marked ready, with zero stale/skipped substitutions.
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
- **SC-006**: Every required hosted journey has positive and boundary evidence for
  its named roles; missing records or participants cannot count as completion.
- **SC-007**: Every pilot blocker has an owner and corrected recheck before approval;
  every other feedback item has a recorded disposition and follow-up owner.
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
  cross-workspace probes preserve the selected membership; zero synthetic pilot
  outputs enter primary customer results or outcome statistics.

## Assumptions

- 002–015 are the implementation baseline; readiness evidence has differing local,
  actual-model, CI and hosted scope. Existing evidence is indexed with honest limits.
- `mcteer` remains the operational/release owner. Security review is an engineering
  assessment of this scoped pilot, not an external certification or compliance claim.
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

### Automated exercise clarification — 2026-10-19

mcteer explicitly directed automation of the operator, internal-member and
assigned-partner exercises. Run actual hosted workflows using distinct authorized
role identities and retain exact deployment, timestamps and capture digests.
Label these observations automated; do not invent participant comments or claim
human usability feedback. G20/G21 accept these attributable automated exercises
with independent review of the actual captures. Local fixtures cannot substitute
for hosted outcomes. The separate scoped release decision remains required under
FR-003; automated observations do not approve release.

The T163 catalog correction changes only the registered title of the existing
strengthened artifact test. All 1,041 cases, 189 suites and acceptance criteria
remain required; the `547322b` incomplete catalog is not a complete pass.
