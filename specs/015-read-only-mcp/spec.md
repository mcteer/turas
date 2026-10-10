# Feature Specification: Read-only MCP Service

**Feature Branch**: `015-read-only-mcp`

**Created**: 2026-10-10

**Status**: Planned; awaiting implementation

**Input**: Start roadmap 015 after release validation: versioned profile, evidence,
plan and report reads through shared policy; scopes, pagination, current
authorization, rate limits and consumer contract tests. Stop before implementation.

## Clarifications

### Session 2026-10-10

- Q: Who may connect external assistants? → A: Internal users and assigned partners, through individually revocable access that never expands current Turas visibility.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect and control access (Priority: P1)

An active member connects a compatible external assistant to one workspace,
explicitly limits readable categories and customers, inspects usage and revokes
access without sharing their Turas password.

**Why this priority**: Private reads need identifiable, revocable authority first.

**Independent Test**: Establish internal/partner consumer identity in an owned
synthetic workspace; revoke each connection and verify subsequent reads fail.

**Acceptance Scenarios**:

1. **Given** an active member, **When** scoped access is created, **Then** it binds that member/workspace and never exceeds current permissions.
2. **Given** another member, **When** they inspect or revoke that connection, **Then** access is denied; canonical administrator mcteer may separately revoke workspace connections with an audit record, without retrieving secrets.
3. **Given** revoked, expired or inactive authority, **When** a consumer reads through an existing session, **Then** no private content returns.

### User Story 2 - Read current customer context (Priority: P1)

An external assistant retrieves authorized reviewed profiles, eligible evidence
and sanitized shared practices, preserving citations, dates and unknowns. Partners
receive assigned delivery-visible customer content only.

**Why this priority**: External guidance needs the same grounded privacy boundaries.

**Independent Test**: Compare consumer projections with current domains for
internal/partner actors; withdraw sources and grants while cleanup is stopped.

**Acceptance Scenarios**:

1. **Given** reviewed and pending records, **When** current context is read, **Then** pending user claims are excluded as facts and accepted revisions retain their provenance.
2. **Given** a partner assigned customer A, **When** A and B are queried, **Then** only A's delivery-visible fields return; hidden fields and B's existence are not disclosed.
3. **Given** withdrawn/superseded evidence or unresolved material conflict, **When** context or citations resolve, **Then** eligibility is rechecked; no invalid prose or settled conflicting claim returns and reads do not refresh original dates.
4. **Given** published knowledge originating elsewhere, **When** an active member reads it, **Then** only sanitized publication and its citation return, without originating customer identity/private lineage.

### User Story 3 - Read reviewed plans and reports (Priority: P2)

A consumer reads accepted plans/designs and permitted published reports with
revision, audience, assumptions and dependency status. It cannot make decisions,
generate content, create exports or send messages.

**Why this priority**: Reviewed commitments and reporting guide downstream work.

**Independent Test**: Retrieve accepted plans and published reports with a real
consumer; deny drafts, wrong audiences, changed scope and withdrawn dependencies.

**Acceptance Scenarios**:

1. **Given** an accepted plan and newer proposal, **When** the plan is read, **Then** only accepted context is presented, with its exact revision and assumptions.
2. **Given** a published restricted report, **When** read, **Then** current authorized audience projection and correction state apply; partners receive only expressly permitted delivery content.
3. **Given** a mutation/generation/send request, **When** invoked, **Then** it is rejected with zero domain changes, model calls, export creations or messages.

### User Story 4 - Operate and verify access (Priority: P2)

Members understand bounded paginated results, safe usage metadata and explicit
empty/denied/unavailable/rate-limited outcomes. Operators disable and recover the
service without changing customer records.

**Why this priority**: Limits and release verification make external access operable.

**Independent Test**: Exercise the full contract with a real consumer, malformed
requests, cross-actor continuation, expiry, quotas and restart; inspect redaction.

**Acceptance Scenarios**:

1. **Given** a multi-page list, **When** continued, **Then** exact scope remains bound and current authority is rechecked; foreign/expired continuation fails.
2. **Given** excessive/oversized work, **When** submitted, **Then** bounded retry-aware errors return without silent truncation, partial factual claims or unbounded queries.
3. **Given** disabled service/incompatible schema, **When** accessed, **Then** reads fail closed without initializing/migrating schemas.

### Edge Cases

- Revocation, expiry, membership/grant loss and withdrawal during reads or between pages: recheck before serialization; no cached private result survives current authority loss.
- Foreign workspace/environment tokens, guessed IDs/names, hidden counts and swapped cursors: opaque denials preserve record-existence boundaries.
- Absent accepted plans/reports, corrections, stale-but-eligible dated evidence, material conflicts and oversized records: explicit status, no invented facts or silent truncation.
- Tool inputs/evidence containing instructions: data only; no arbitrary URL/file fetching, tools, research or approvals.
- Concurrent credential management, uncertain response delivery, database failure and cleanup outage: fail closed and retain minimal audit.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provide a documented versioned read-only MCP interface usable by an actual compatible consumer, with an explicit read allowlist.
- **FR-002**: Bind scoped expiring individually revocable access to one active principal, membership, workspace and environment; never use Turas passwords as MCP credentials.
- **FR-003**: Members manage only their own connections; canonical active internal administrator mcteer may revoke workspace connections without recovering secrets. Creation requires explicit category/customer scope review.
- **FR-004**: Intersect credential scopes with current server/domain permissions before retrieval and before returning content. Partners retain individual customer grants and delivery-category limits; protocol sessions never grant lasting authority.
- **FR-005**: Return reviewed profile/maturity context with workload, accepted revisions, original dates and unknowns; maturity stays separate from engagement stage and opportunity.
- **FR-006**: Return eligible customer evidence and resolvable citations with source/revision/location, factual acceptance, research attribution, quality, freshness and conflict labels. Pending user claims never become facts.
- **FR-007**: Return current sanitized published shared knowledge to active members including partners, without private lineage, originating customer identity or aggregate statistics.
- **FR-008**: Return accepted delivery plans/designs with revision, baseline, assumptions and current dependency status; exclude unaccepted changes from accepted context.
- **FR-009**: Return authorized published report projections with audience, publication/correction state and source eligibility; exclude unpublished drafts, files and unauthorized operational receipts.
- **FR-010**: Exclude conversations, workforce/financial material, private learning candidates/captures, cross-customer metrics, product-gap aggregates and partner demonstrations from this initial interface.
- **FR-011**: Use strict bounded inputs, deterministic paginated lists and scope-bound expiring opaque continuation; reject malformed/foreign/expired/changed-scope continuation without hidden counts or existence disclosures.
- **FR-012**: Apply bounded read quotas per credential, actor and workspace with retry guidance; never trigger automatic model/research dispatch or hidden retries.
- **FR-013**: Reject all domain mutation, acceptance, publication, generation, download/export creation and external sends. Only connection management, quotas, content-free continuation/citation handles and minimized audit may write operational metadata.
- **FR-014**: Enforce withdrawal/correction/access changes synchronously with workers stopped; do not cache private result prose across calls or substitute a different revision silently.
- **FR-015**: Protect connection management with existing session/request-forgery controls; reveal credentials once, store no plaintext secrets, redact telemetry and avoid browser storage of secrets/private content.
- **FR-016**: Provide accessible connection management, safe usage metadata, explicit result states, bounded request IDs and documented consumer setup without private values in authored artifacts.
- **FR-017**: Use explicit migration/readiness checks, least-privilege runtime grants, an operator disable switch, forward recovery and revocation/expiry cleanup; no schema changes inside request handlers.
- **FR-018**: Validate every allowlisted read/denial through consumer contract, authorization/lifecycle/pagination/quota/recovery and CLI WebKit checks. After merge verify deployed identity, target migrations/grants and available authenticated Production behavior; no synthetic customer records or paid calls in Production checks.

### Key Entities

- **Connection**: Member/workspace/environment binding, reviewed read/customer scopes, credential fingerprint, creation/expiry/revocation and safe usage metadata.
- **Read projection**: Versioned eligible profile, evidence, shared practice, accepted plan or published report with governed revision/citation status.
- **Continuation**: Expiring opaque position bound to exact actor/connection/read/scope; never an authorization grant.
- **Access receipt**: Content-free continuation/citation binding or minimal connection/read category, time, result, duration and correlation identity; no credentials, customer prose or hidden names.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Internal and assigned-partner consumers complete all five categories using the published contract. Every allowed projection matches its current domain; every forbidden read/mutation fails.
- **SC-002**: Every expiry/revocation/membership/grant/source-loss case withholds affected content on the next read, citation resolve or page, including cleanup outage.
- **SC-003**: Members create/revoke their own access within two minutes in four desktop/mobile light/dark browser configurations, with zero serious/critical accessibility violations.
- **SC-004**: Five read categories each complete 100 synthetic governed reads with p95 below one second, excluding consumer/network overhead; pacing and quota denials are reported separately without bypassing limits.
- **SC-005**: Complete deterministic/consumer/browser suites and same-source CI pass without skipped cases; forbidden mutation cases produce zero domain writes, model dispatches, exports or sends.
- **SC-006**: Empty and 054 upgrade/restart/recovery checks preserve existing records and selected local state. Hosted completion requires deployed identity, target schema/grants and available Production access/read checks with remaining record-dependent limits recorded.

## Assumptions

- Initial consumers support manually configured scoped credentials; browser-based federation and automatic registration are outside this slice unless technical research shows they are necessary for the selected contract.
- Scopes narrow access without creating customer grants. Shared knowledge follows its separate sanitized publication policy.
- Reuse governed 003/005/006/009 reads; unsafe projections must be corrected in their domain before exposure. A permitted category with no records returns an honest empty/unavailable result.
- Dependencies are merged; current Production schema is 054. No actual-model behavior changes or extra roadmap features/integrations/research runs are included. Preserve Turi's model.
- Read-only concerns customer/domain behavior; operational connection/quota/audit metadata writes remain necessary.
