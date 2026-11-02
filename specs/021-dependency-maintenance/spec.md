# Feature Specification: Assessed dependency maintenance and resource cleanup

**Feature Branch**: `021-dependency-maintenance`
**Created**: 2026-11-02
**Status**: Specified; implementation and release pending
**Input**: Assess existing branches, seven Dependabot PRs and Vercel resources. Implement and validate needed updates before retiring their branches; preserve work and recovery material.

## User Scenarios & Testing

### User Story 1 — Use a maintained production platform (Priority: P1)

Users retain account access, private conversations, governed research, files and reports while known dependency vulnerabilities are remediated.

**Why this priority**: Open alerts include critical application and high validation/network findings.
**Independent Test**: Audit all three lockfiles, build the actual runtime, run existing authorization/domain checks, then exercise authenticated Preview and Production.

**Acceptance Scenarios**:
1. Given the current alert inventory, when maintenance is complete, then every finding has either a patched installed dependency or an explicit unresolved disposition; no alert is dismissed merely to achieve a count.
2. Given an interrupted specialist response, when the provider terminates without a completion signal, then it cannot be treated as successfully completed or release uncertain accounting holds.
3. Given a malformed read-only integration credential, when it is received, then it is rejected before database access with the same generic authentication response; valid credential syntax still requires persisted authorization.
4. Given ordinary existing accounts and customer research, when the release is deployed, then the existing profile, privacy and conversation checks pass without replacing credentials or importing fictional data.

### User Story 2 — Trust verification artifacts (Priority: P1)

Maintainers receive verification results whose downloaded contents must match the published artifact digest.

**Why this priority**: Download warnings must not allow altered reports to establish acceptance.
**Independent Test**: Run the existing four-project completeness job with the upgraded download action and an explicit error policy for digest mismatch.

**Acceptance Scenarios**:
1. Given four reports from this run attempt, when they are downloaded, then their original directory structure is retained and completeness verification passes only after all producer jobs succeed.
2. Given a digest mismatch, when download runs, then the job fails before completeness verification; no warning-only override is permitted.

### User Story 3 — Retire only assessed resources (Priority: P1)

Maintainers can trace every branch, PR, project and environment-setting disposition to evidence, preserving required code, archives, keys and operational safeguards.

**Why this priority**: Deleting branch names or historically named projects is not an assessment.
**Independent Test**: Compare immutable commits and source changes, map PR updates to the replacement release, and inventory Vercel metadata without printing secret values.

**Acceptance Scenarios**:
1. Given a superseded dependency PR, when its branch is retired, then the replacement release contains the update or an explicitly documented reason for exclusion, with checks recorded.
2. Given an old branch with commits absent from main, when cleanup runs, then squash-merge or replacement evidence establishes its disposition; uncertain unique work stays recoverable and is not silently discarded.
3. Given backup resources or recovery-key records, when cleanup is assessed, then archive/key/retention dependencies are established before deletion; historical names alone establish no redundancy.
4. Given overrides scoped solely to an absent review branch, when they are removed after acceptance, then ordinary Production and Preview settings and the shared administrator credential are preserved.

### Edge Cases

- A grouped development update advances the environment loader but leaves the vulnerable application framework unchanged.
- A dependency has nested versions in multiple major lines; patching one line must not force incompatible versions on every consumer.
- An older and newer PR update the same report-renderer dependency.
- A restored PR is concurrently rebased by Dependabot; compare current immutable heads before retiring it.
- A squash merge contains changes without retaining original commit ancestry.
- Old recovery keys may be the sole decryptors of retained captures.
- Missing hosted evidence or failed CI remains incomplete, even if local checks pass.

## Requirements

### Functional Requirements

- **FR-001**: Inventory and assess PR53–59 and current security alerts across all three npm projects before dependency edits.
- **FR-002**: Review intervening releases for upgrades crossing the repository threshold, select useful capabilities with application/platform wiring and acceptance, and explain excluded capabilities in research.md.
- **FR-003**: Upgrade the application framework and matching environment loader together; preserve root agent model and Eve runtime selection.
- **FR-004**: Adopt allocation-free boolean credential syntax validation without replacing parsed/transformed domain validation or persisted authorization.
- **FR-005**: Explicitly handle interrupted specialist provider finishes without marking incomplete operations completed or refunding unknown usage.
- **FR-006**: Enforce artifact digest errors and preserve existing run-attempt scoping, producer-success and complete-report checks.
- **FR-007**: Preserve account credentials, database/store identity, source approval, partner grants, owner-private conversations, cost ceilings and recovery holds.
- **FR-008**: Record local, CI, Preview and Production evidence separately; complete relevant hosted checks before claiming release completion.
- **FR-009**: Retire assessed branches and superseded PRs only after their work is delivered or explicitly accounted for; leave unresolved work visible.
- **FR-010**: Assess Vercel resources by actual function and dependencies; preserve active backup service, retained keys and archives. Remove only proven obsolete settings within the authorized cleanup scope.

### Key Entities

- **Dependency disposition**: Original PR, package/version, vulnerability, selected replacement, capability adoption, evidence and unresolved limitations.
- **Resource disposition**: Project/branch/setting identity, function, dependencies, retention constraints, evidence and action.
- **Release evidence**: Exact source, installed versions, checks, deployment identity and actual hosted observations.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All seven dependency PRs and all initially open alerts have an inspectable disposition.
- **SC-002**: Both original local branches have an evidenced disposition with recoverable source preserved until assessment is complete.
- **SC-003**: Malformed credential checks perform no database work and interrupted provider responses cannot establish successful completion.
- **SC-004**: The existing complete-report check succeeds with digest enforcement enabled.
- **SC-005**: Required local and hosted acceptance passes before release is recorded complete; unresolved checks remain explicit.
- **SC-006**: Every discovered Vercel project and branch override has a documented keep/remove/defer decision without exposing credential values.

## Assumptions

- User authorization includes implementing and validating necessary maintenance through release; it does not waive repository review or evidence requirements.
- This slice introduces no database schema or account changes, speculative integrations or firewall rules.
- Optional framework features requiring a new product workflow are deferred with rationale rather than enabled incidentally.
