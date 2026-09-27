# Feature Specification: Identity, persistence and application shell

**Feature Branch**: `002-identity-platform-shell`

**Created**: 2026-09-26

**Status**: Analysis findings remediated — implementation pending

**Input**: Proceed with specify and clarify for roadmap feature 002: identity,
persistence and application shell, building on the merged foundation.

## Scope

Deliver the first authenticated Turas application: admitted users can enter the
familiar interface, select an authorized customer, and hold a private, durable
conversation with Turi. Administrators can manage access without automatically
receiving authority over other users' conversations. Establish internal and partner identity and
customer boundaries before later features add sensitive workflows. For this demo,
working sign-in uses `panel`, `mcteer` and `partner` demo accounts. Full authentication,
individual employee/partner onboarding and federation are deferred until the user
chooses to proceed following hiring; they are not acceptance gates for 002.
The initial demo supports synthetic customer data and public research only;
private real-customer information is outside this release's scope.
On 2026-09-27 the user disconnected the repository from Vercel and deferred
deployments until the platform can replace the existing application. Feature 002
therefore validates locally; hosted verification remains a later release gate.

This slice covers minimal customer references needed for access and conversation
association. Rich profiles and context approval belong to 003; attachments to 004;
research and RAG to 005; planning, operations, reports and partner enablement remain
in their respective [roadmap slices](../../ROADMAP.md). Do not show inactive
feature navigation or an attachment control that cannot accept files. No customer
self-service login, shared chats, demo migration or external report delivery.

## Clarifications

### Session 2026-09-27

- Q: Who needs working sign-in when feature 002 is complete? → A: Use the `panel`
  and `mcteer` logins for now; full authentication will be wired later if hired.
- Q: What permissions should the two demo accounts have? → A: `mcteer` administers
  access; `panel` uses customer/chat features. Both access all demo customers, with
  separate chat histories.
- Q: What customer data should the initial demo support? → A: Synthetic customer
  data and public research only; private real-customer information is deferred.

**Subsequent user direction (2026-09-27):** Add the `partner` login. `panel` models
an internal Vercel employee; `mcteer` models an internal Vercel administrator, primarily
FDE/PS leadership. This expands the earlier two-account clarification to three accounts.
The user selected a limited subset of demo customers for `partner`: initial fixtures
include at least one granted customer shared with the internal accounts and one
customer denied to `partner`.
Internal Vercel employees and admins can view all customer profiles in their
workspace; per-customer assignment restrictions apply to partners, not internal users.
The user clarified that broad internal visibility means every customer profile,
including non-delivery use; existing private-chat ownership is unchanged. Partners
receive delivery-relevant information for assigned customers only. All active platform
users may use reviewed shared product learnings without source-customer identification;
005 implements shared retrieval/publication, 006 uses it in plans, and 014 extends
the learning loop. This does not grant access to another customer's raw evidence.

## User Scenarios & Testing

### User Story 1 - Enter and leave an authorized workspace (Priority: P1)

As a demo user, I can sign in with `panel`, `mcteer` or `partner`, see the active account and
workspace, and sign out; unknown or disabled accounts cannot enter the application.

**Why this priority**: Every subsequent customer interaction depends on knowing
who is acting and whether they retain access.

**Independent Test**: Use admitted, unknown and disabled identities to exercise
entry, session expiry and sign-out without any customer content or model call.

**Acceptance Scenarios**:

1. **Given** valid credentials for active `panel`, `mcteer` or `partner`, **When** sign-in
   succeeds, **Then** the shell displays that account and its authorized workspace.
2. **Given** an unknown or disabled identity, **When** entry is attempted,
   **Then** access is denied without revealing customer or conversation metadata.
3. **Given** a signed-in user, **When** they sign out or their session expires,
   **Then** subsequent protected actions require valid authentication and the
   interface clears protected content.
4. **Given** missing demo login configuration or invalid credentials, **When**
   sign-in is attempted, **Then** access fails closed with an appropriate error.

### User Story 2 - Grant and revoke bounded customer access (Priority: P1)

As a platform administrator, I can disable configured accounts and manage their
customer grants. `panel` represents an internal Vercel employee; `mcteer` represents
an internal Vercel administrator, primarily FDE/PS leadership. `partner` represents
an external partner member attached to a synthetic partner organization. Each account
sees only permitted customers; additional organizations/workspaces remain test fixtures.

**Why this priority**: Access must be enforced before durable customer content is
introduced; a partner must never inherit another organization's access.

**Independent Test**: Use two workspaces, two partner organizations and synthetic
customer references to verify grants, revocation and denied direct access.

**Acceptance Scenarios**:

1. **Given** a partner member with no customer grants, **When** they enter the shell,
   **Then** the directory has a useful empty state with no customer metadata.
2. **Given** an authorized administrator, **When** they grant or revoke access,
   **Then** the change is persisted and attributed to the actor and affected scope.
3. **Given** a partner with access to customer A, **When** they request customer B
   or another workspace through any entry point, **Then** content and existence
   details are withheld even if they know an identifier.
4. **Given** a revoked partner grant, **When** an existing session next reads, writes,
   resumes or controls the affected conversation, **Then** the operation is denied.
5. **Given** an administrator managing workspace membership, **When** they
   change access, **Then** that administrative action does not bypass chat policy.
6. **Given** the initial demo setup, **When** either internal account opens customer
   selection, **Then** all current and newly added demo customers in the workspace are available;
   only `mcteer` can administer access, and no account can read another account's chats.
7. **Given** a signed-in `panel` or `partner` session, **When** it directly requests an
   administrative action or audit view, **Then** the server denies the request.
8. **Given** the `partner` login, **When** it selects a customer or supplies an ID
   directly, **Then** only its limited granted subset is accessible; an ungranted
   demo customer and other accounts' chats remain inaccessible.

### User Story 3 - Continue a private customer conversation (Priority: P1)

As a member, I can select an authorized customer, start a conversation with Turi,
read streaming replies, stop a response, and return to my saved history.

**Why this priority**: This is the first usable product loop and establishes the
ownership boundary that later attachments and customer workflows will use.

**Independent Test**: With two granted users and a controlled assistant response,
verify send, reload, reconnect, cancellation and cross-owner denial. Separately
verify a live eve response in the intended test environment using synthetic input.

**Acceptance Scenarios**:

1. **Given** a selected authorized customer, **When** the user sends a message,
   **Then** one owned conversation records the customer, message and response state.
2. **Given** a saved conversation, **When** its owner reloads or signs in again,
   **Then** persisted messages and accurate response status remain available.
3. **Given** two users granted the same customer, **When** one requests the
   other's conversation or its stream/control endpoint, **Then** access is denied.
4. **Given** a disconnected response, **When** the owner reconnects,
   **Then** they see persisted progress and its current state without duplicate
   messages or an implicit second model run.
5. **Given** a running response, **When** its owner stops it, **Then** the response
   is marked cancelled and partial content is distinguished from a completed reply.
6. **Given** user-provided customer claims, **When** Turi responds, **Then** they
   remain conversation input and are not published as accepted profile facts.

### User Story 4 - Work in the familiar accessible shell (Priority: P2)

As a user, I can navigate between my customer selection and conversations using a
responsive light or dark interface consistent with the reference demo.

**Why this priority**: Visual continuity makes the fresh build recognizable while
clear state and keyboard behavior make its first workflow usable.

**Independent Test**: Exercise synthetic empty, populated, loading, denied and
error screens at mobile and desktop widths in both themes, without live services.

**Acceptance Scenarios**:

1. **Given** a desktop viewport, **When** the application opens, **Then** the
   sidebar, new-chat action, own-history search, identity controls and centered
   chat/composer follow the [visual reference](../../docs/design-reference.md).
2. **Given** a narrow viewport or keyboard-only use, **When** the user navigates,
   **Then** controls remain reachable, focus remains visible, mobile navigation
   returns focus when closed, and page content has no horizontal overflow.
3. **Given** an unavailable service or empty history, **When** a view opens,
   **Then** the interface distinguishes unavailable, loading and empty states and
   offers an appropriate retry or next action without claiming saved success.
4. **Given** any demo account, **When** the chat composer is available,
   **Then** a visible demo notice states that only synthetic customer data and
   public research are permitted; fixtures are identified as synthetic.

### Edge Cases

- A member is disabled or loses a grant during streaming: stop further protected
  delivery within the revocation bound; already delivered content cannot be recalled.
- The same customer is granted to two partner organizations: each member's private
  conversations remain isolated; a customer grant does not grant internal fields.
- Duplicate submissions or reconnects: reconcile the original request; never create
  duplicate messages or silently restart a model run.
- Concurrent grant changes: reject stale updates rather than silently overwriting
  a newer decision; prevent removal of the last active platform administrator.
- A conversation identifier or customer identifier is changed in a request: enforce
  current ownership and grants independently of UI selection and model instructions.
- Persistence fails: show an unsaved/failed state and do not launch a response for a
  message whose acceptance cannot be confirmed.
- Multiple people use `panel`: they act as the same demo principal and share that
  account's history. Audit events identify the account, not the individual person.
- Later authentication replaces demo login: stable ownership and grant records must
  not be reassigned automatically merely because a display name or email matches.
- Missing configuration or incompatible storage version: report unavailable health
  and fail closed, without silently creating schema or connecting to demo resources.

## Requirements

### Functional Requirements

- **FR-001**: Support credential-checked sign-in for the three configured demo
  accounts, `panel`, `mcteer` and `partner`, as distinct stable principals. Keep credentials
  outside source control and client-visible configuration. No public registration
  or customer access inferred from a supplied username is permitted.
- **FR-002**: Provide working demo login, session expiry and sign-out for all three
  accounts. Defer full authentication, employee/partner onboarding and federation
  until explicitly resumed after hiring. Preserve internal/partner access boundaries
  in the domain model and tests without requiring a live partner identity provider.
- **FR-003**: Persist stable principals, workspace memberships, internal/partner
  classification, partner affiliation, roles, customer grants and disabled states.
  Authentication alone MUST NOT confer membership or a customer grant.
- **FR-004**: Provide authorized administration for account disabling and grant
  changes with explicit scope and audit history. `mcteer` represents internal Vercel
  administrators, primarily FDE/PS leadership; `panel` represents internal Vercel
  employees. `partner` is an external partner member in a synthetic partner
  organization. Only `mcteer` has access-administration and audit-view authority.
  Active internal Vercel membership grants access to all current and future customer
  records in that workspace without per-customer grants;
  partner access requires its own explicit customer grants to a limited subset,
  initially including one shared granted customer and excluding at least one other
  demo customer. These grants remain revocable and MUST NOT
  bypass normal checks. Administration does not confer access to the other
  accounts' conversations.
  Customer assignment permits only delivery-relevant partner views, not unrestricted
  internal profile data. In 002 the customer reference exposes only its identifier,
  display name and synthetic label; 003 defines rich-profile field projections.
- **FR-005**: Deny access by default and enforce current workspace, partner,
  customer and owner boundaries before reads, writes, history search, streaming,
  resume and cancellation. UI visibility and assistant wording are not enforcement.
- **FR-006**: Support minimal customer references with stable identifiers, display
  names and workspace ownership, sufficient for grants and explicit selection.
  References MUST NOT imply that maturity, research or profiles are implemented.
- **FR-007**: Require customer selection before creating a conversation. Bind it
  permanently to its creator, workspace and customer; starting for another customer
  creates a new conversation. Conversations are private to their creator in 002.
- **FR-008**: Persist messages, chronological order, request identity and response
  state (pending, running, completed, cancelled or failed). Show only the owner's
  currently authorized conversations in history and title search.
- **FR-009**: Support streamed replies, owner cancellation and reconnection to
  existing progress. Retries MUST be idempotent and failures MUST remain visible;
  incomplete text MUST NOT be presented as a completed response.
- **FR-010**: Recheck access on every new protected operation. Revocation or member
  disablement MUST stop further delivery over an already open stream within 30
  seconds, including a reconnected stream. Sign-out clears protected UI state.
- **FR-011**: Customer claims made in chat MUST NOT create accepted customer facts.
  Turi MUST describe current capabilities accurately and must not claim to have
  searched customer documents, saved a profile or executed an unavailable workflow.
- **FR-012**: Preserve the reference typography, restrained colors, sidebar,
  centered chat and composer, responsive navigation and light/dark themes. Expose
  only implemented actions, with labeled controls and useful failure states.
- **FR-013**: Retain accepted records across reloads and application restarts.
  Establish explicit, versioned migrations with tested failure recovery against
  disposable data; application requests MUST NOT create or migrate schemas.
- **FR-014**: Keep development/test, preview and production data and identities
  isolated. Permit only synthetic customer data and public research in this demo,
  with no private real-customer information or implicit demo import. Label synthetic
  fixtures and display this data-use boundary in the chat interface and setup
  documentation. Public research supplied in chat remains unapproved input under
  FR-011; this permission does not add research or ingestion tools to 002.
- **FR-015**: Record identity/admission changes, grant decisions, denied access and
  response failures with actor/scope identifiers, time, outcome and correlation
  information. Routine logs MUST omit credentials, message bodies and customer
  content; audit viewing MUST itself require authority.
- **FR-016**: Bound message size, concurrent responses and request rates; reject
  excess with an understandable retry/limit state. Define concrete operating limits
  in the implementation plan and demonstrate them in acceptance evidence.
- **FR-017**: Verify the shell and real eve runtime locally using the repository-root
  `npm run dev` entry point. Prepare a Vercel-compatible build without reconnecting
  the repository, changing hosted project settings or deploying. Defer hosted
  verification and project alignment until replacement readiness. Document required
  configuration, environment failures and recovery without secrets.

### Key Entities

- **Principal**: Stable authenticated account, display attributes and active/disabled
  state; separate from workspace membership. In 002, `panel`, `mcteer` and `partner` identify
  demo accounts rather than verified individual employees or partners.
- **Workspace membership**: Principal, workspace, internal/partner classification,
  partner organization when applicable, role and lifecycle state.
- **Partner organization**: A bounded affiliation; belonging to it does not by itself
  grant customer access or access to another member's conversations.
- **Customer reference**: Stable workspace-scoped identity and display name, preceding
  the richer profile introduced in 003.
- **Customer grant**: Explicit member/customer permission, granting actor, timestamps,
  active/revoked state and revision for concurrent-change detection.
- **Conversation**: Immutable owner/workspace/customer association, title, creation
  and update dates, ordered messages and response attempts.
- **Response attempt**: Request identity, progress, terminal status and safe error
  information used to reconcile retries, cancellation and reconnection.
- **Access audit event**: Attributed, dated access or administration outcome with
  scope and correlation identifiers; not a transcript of customer content.

## Success Criteria

### Measurable Outcomes

- **SC-001**: `panel`, `mcteer` and `partner` can sign in, identify their workspace and
  sign out; all invalid-credential, unknown, disabled and expired-session cases
  are denied. Full authentication-provider integration is not required for acceptance.
  Internal accounts can select all current and newly added workspace customers;
  `partner` can select only its assigned subset. Only `mcteer`
  can administer access, and cross-account chat reads are denied for every account pair.
- **SC-002**: All access-matrix cases pass for two workspaces, two partner
  organizations, two customers and multiple users, including guessed identifiers,
  same-customer/different-owner conversations, streams, resume and cancellation.
- **SC-003**: Revocation blocks all subsequent protected operations and ends further
  protected streaming within 30 seconds in every tested revocation scenario.
- **SC-004**: All acknowledged messages and their final or interrupted states survive
  refresh and application restart; replay and reconnect tests create zero duplicate
  messages or unintended response attempts.
- **SC-005**: At 390px and 1440px viewport widths, both themes support the complete
  sign-in/customer/chat/sign-out journey with keyboard access, visible focus, labeled
  controls and no horizontal page overflow. Core screens have no serious or critical
  automated accessibility findings, supplemented by manual keyboard checks.
- **SC-006**: With 20 concurrent authenticated client sessions across the three demo
  accounts (7 mcteer, 7 panel, 6 partner) and 1,000 synthetic conversations,
  customer selection and the first page of owned history become usable within two
  seconds at the 95th percentile in the test environment. Model generation and
  external sign-in latency are measured separately, not hidden in this target.
  After 30s warmup, measure 120s with one customer-list and one first-page history
  request per client per second, page size 25, no model calls. Both endpoints must
  meet the target separately with zero unexpected errors or unauthorized results.
- **SC-007**: A clean isolated environment can be initialized through the documented
  process, and a simulated failed migration can be recovered without loss of
  previously acknowledged test records.
- **SC-008**: The local application demonstrates an authenticated, authorized,
  persisted conversation with a real Turi response using synthetic input through
  the root `npm run dev` workflow. Mocks alone do not satisfy this outcome.
  Hosted behavior is explicitly unverified until the later replacement-readiness gate.
- **SC-009**: All three demo accounts see the data-use notice before submitting a chat;
  all committed customer fixtures are labeled synthetic, and acceptance artifacts
  contain only synthetic customer data or identified public sources.

## Assumptions

- Feature 001 was merged in PR 1. The [constitution](../../.specify/memory/constitution.md),
  [product blueprint](../../docs/product-blueprint.md) and visual reference govern
  this slice; their proposed infrastructure choices do not select an identity vendor.
- The initial application is English-only, supports one selected workspace at a
  time and does not offer offline interaction. Multiple workspaces exist in boundary
  tests; self-service workspace creation and cross-workspace portfolio views are out.
- Internal membership permits all customer profiles within its workspace; partners
  require explicit assignments/grants for each customer they help. Administration
  does not bypass private conversation ownership. Additional business approval roles
  will be specified with the features that implement their actions.
- Partner-specific learning and delivery screens remain in 013; the partner demo
  account uses the same scoped shell and chat in 002. Customer recipients do not get login in 002.
- Published shared product learnings are a separate platform-wide knowledge scope,
  available to internal and partner members without originating-customer access.
  Publication requires review and removal of identifying/confidential context under
  the [shared knowledge policy](../../docs/evidence-policy.md#shared-product-knowledge).
  Implement this in 005/006; do not add unused shared-knowledge storage/tools in 002.
- The implementation plan will inspect the existing demo login behavior and resolve
  credential configuration, initial account setup, minimal customer-reference setup,
  storage provider/region, operating limits and recovery mechanics. A missing external
  prerequisite must be reported rather than replaced by a production bypass.
- Synthetic customer data and public research are the confirmed demo scope. The
  notice communicates that boundary; automatic detection of all confidential text
  is not claimed. A future private-customer rollout requires resolving classification,
  retention, residency and permitted-model decisions from the
  [decision register](../../docs/decisions.md).
- eve remains the agent core and its selected model is preserved. Add integrations
  only when needed by implemented behavior. UI validation uses command-line
  Playwright with WebKit; no host-browser operation is required.
