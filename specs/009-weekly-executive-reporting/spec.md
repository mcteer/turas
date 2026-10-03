# Feature Specification: Weekly and Executive Reporting

**Feature Branch**: `009-weekly-executive-reporting`

**Created**: 2026-10-03

**Status**: Specified and clarified; per-send approval confirmed. Implementation has not started.

**Input**: Run specify, clarify, plan, tasks and analyze for roadmap 009, then hand off before implement. Scope is TR-04 after merged 008, using the weekly and executive content contracts.

## Scope and Outcomes

Delivery leads need trustworthy weekly updates and customer executives need a
consistent monthly or quarterly review. Generate versioned reports from reviewed
delivery records and eligible customer evidence, review an exact audience-specific
revision, render professional artifacts, and track delivery separately from approval.
One customer is the boundary: weekly reports cover one accepted engagement;
executive reviews cover explicitly selected engagements and workloads for that
customer. Unknowns, late entries and unmeasured outcomes stay visible.

Include weekly drafts, recipient policies, review/publication/corrections, monthly
and calendar-quarter executive PDFs and editable 16:9 QBR slides, brand/template
validation, audience projections, and durable email delivery attempts/receipts.
A visible weekly schedule prepares drafts. Use the existing identities and keep
canonical `mcteer` as report reviewer and recipient-policy authority for this slice.

Exclude customer login, delegated approvers, marketing campaigns, Slack/Teams
channels, fiscal/custom calendars, cross-customer portfolio reports, automatic
maturity changes, new TAM/expansion/product-gap workflows, finance imports,
commercial commitments, and new model routing. Reports cannot approve their source
facts. Existing private conversations and workforce evidence are not report inputs.
This planning run does not install integrations or change hosting resources.

## Clarifications

### Session 2026-10-03

- Q: Should 009 require mcteer to approve each report before email delivery, or allow automatic weekly sends under an approved recurring policy? → A: **Approve every send** (user confirmed). Generate weekly drafts automatically; mcteer approves the exact report and recipients before each send.

Authority follows the established mcteer-only workflow. Provider and renderer
selection are technical research decisions. The plan uses a new versioned report
master from official assets, with actual brand-profile approval and verified sender/
test-recipient configuration as explicit release inputs. No unavailable brand
approval or external configuration is assumed. All ambiguity categories have a
bounded requirement or documented default; no blocking clarification marker remains.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review a Trustworthy Weekly Update (Priority: P1)

An internal delivery lead prepares a weekly draft from an accepted engagement.
The report separates work performed, accepted milestones, approved effort,
forecasts, risks, customer actions and missing information. The reviewer approves
an exact revision for an explicit audience.

**Why this priority**: Reliable content and review are prerequisites for artifacts and delivery.

**Independent Test**: Create a real accepted engagement through existing workflows,
review delivery logs/time, generate one weekly draft and publish an exact revision.
No email provider is needed to prove this story.

**Acceptance Scenarios**:

1. **Given** reviewed logs and pending corrections, **When** a weekly report is
   prepared, **Then** it uses the accepted versions at its cutoff, includes all eight
   weekly sections, and distinguishes performed work from accepted deliverables.
2. **Given** no reviewed logs, **When** a draft is prepared, **Then** it states
   “no validated update available”; it does not infer that delivery is on track.
3. **Given** a draft and eligible source revisions, **When** mcteer approves the
   exact preview, **Then** a single immutable publication with digest, audience,
   source lineage, reviewer and time is created; a stale preview is refused.
4. **Given** a published report and a late approved correction, **When** a lead
   refreshes it, **Then** a labeled new revision shows the difference and requires
   fresh review; the old publication is never silently overwritten.

### User Story 2 - Deliver Reviewed Reports Reliably (Priority: P1)

The reviewer configures explicit customer-bound recipients, reviews what will be
sent, and can see whether each recipient's delivery was queued, accepted by the
provider, delivered, failed or uncertain. A weekly schedule avoids manual draft setup.

**Why this priority**: A saved report is not a delivered customer update.

**Independent Test**: Use a controlled mail transport to race duplicate sends,
restart a worker and reconcile a lost acknowledgement without duplicating delivery.

**Acceptance Scenarios**:

1. **Given** an approved recipient policy and publication, **When** a send is
   authorized, **Then** the exact content, artifact versions and recipient set are
   bound to an auditable decision; later policy changes cannot retarget that send.
2. **Given** a timeout after the provider may have accepted mail, **When** work
   resumes, **Then** delivery remains uncertain until reconciled; the system never
   blindly sends another copy under a different identity.
3. **Given** two recipients with different outcomes, **When** a retry is authorized,
   **Then** the completed recipient is not resent and the uncertain one is not
   treated as definitely failed. Provider acceptance is not labeled delivery.
4. **Given** revoked permission, withdrawn source or paused recipient policy,
   **When** a queued send reaches dispatch, **Then** it is withheld before dispatch;
   already dispatched mail is recorded accurately and cannot be recalled by Turas.
5. **Given** a weekly schedule crossing a daylight-saving boundary or downtime,
   **When** the worker resumes, **Then** each due period has at most one draft job,
   missed periods are visible, and no catch-up burst sends old reports.

### User Story 3 - Produce an Executive PDF and Editable QBR (Priority: P2)

A delivery lead selects a month or calendar quarter and customer workloads, reviews
one structured executive narrative, and produces a standalone PDF and an editable
presentation. Both represent the same approved report and audience.

**Why this priority**: Executives need consistent, reusable artifacts with measured outcomes and clear decisions.

**Independent Test**: Generate both formats from a synthetic reviewed customer with
multiple engagements; open, render and inspect every page/slide and edit slide text,
metrics and charts without recreating them from a flat image.

**Acceptance Scenarios**:

1. **Given** eligible customer context and delivery records, **When** a monthly or
   quarterly draft is generated, **Then** its six required sections and appendix
   show source-backed outcomes, scoped maturity, value/adoption, delivery, risk and
   next actions; unavailable future-feature inputs remain explicitly unavailable.
2. **Given** missing baselines or incomparable measurements, **When** charts and
   narrative are generated, **Then** they do not invent ROI, average maturity labels,
   combine currencies or claim comparable progress without a common basis.
3. **Given** an approved brand profile and validated template, **When** a revision
   is released, **Then** both formats retain selectable text, labels, source footer,
   period and audience, with no clipped text, unreadable charts or broken links.
4. **Given** long content or unavailable branding, **When** artifact validation
   fails, **Then** publication/delivery is blocked with a repairable reason; a
   synthetic preview is clearly marked and cannot claim official brand approval.

### User Story 4 - Enforce Audience and Source Boundaries (Priority: P2)

Internal readers see authorized reports; an assigned partner sees only published
delivery projections for its granted customer. Reviewers can investigate source
changes and restricted audit metadata without releasing old protected content.

**Why this priority**: Audience mistakes must be prevented before generation and every release.

**Independent Test**: Exercise internal, assigned/unassigned partner and revoked
identities against draft, publication, download, replay and pending-send paths;
withdraw a source between preparation and release.

**Acceptance Scenarios**:

1. **Given** an external customer/partner audience, **When** a draft or artifact is
   produced, **Then** internal notes, private conversations, workforce evidence,
   rates/margins and other customers are absent from content, metadata and links.
2. **Given** an internal account-team or leadership audience, **When** a report is
   produced, **Then** recipient labels do not grant finance/personnel privileges;
   this slice excludes individual workforce evidence and restricted finance entirely.
3. **Given** source withdrawal or a revoked customer grant, **When** a stored report,
   file, receipt or history is read, **Then** current policy withholds affected
   content immediately; minimal audit identity and correction status survive cleanup.
4. **Given** malicious source text or a prompt to send/approve, **When** generated
   content is processed, **Then** text cannot alter authority, recipients, facts,
   templates or send state; human decision rights remain server enforced.

### Edge Cases

- Empty weeks, incomplete periods, late logs, post-closeout corrections and replaced baselines.
- Timezone change, DST folds/gaps, leap years, quarter/year boundaries and duplicate scheduler ticks.
- Concurrent revisions, approval versus withdrawal, recipient edits versus dispatch and stale browser previews.
- Same request key with different body; duplicate/out-of-order receipt events; worker death before/after network dispatch.
- Provider outage, expired provider deduplication window, oversized mail and partial recipient failure.
- Unsupported branding, excessive text, missing glyphs, broken source links and expired artifact retrieval.
- Partner revocation while downloading; a deleted source in an already-sent report; private filenames or recipient addresses leaking through metadata.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Enforce current environment, workspace, member/session, customer and
  audience permissions before retrieval and before draft, publication, download,
  decision or replay releases content. Interactive actions require a current session;
  scheduled work/dispatch require a recorded durable authorization and current
  active principal/member/customer authority, without borrowing a browser session.
- **FR-002**: Bind weekly reports to one engagement and a Monday–Sunday week in an
  explicit IANA timezone; bind executive reports to one customer, explicit workload
  and engagement selection, and a calendar month/quarter. Retain period boundaries,
  as-of cutoff and partial-period labels independently of generation time.
- **FR-003**: Build reports only from eligible reviewed 003/005/006/007/008 inputs,
  with exact source versions and measurement basis. Pending/rejected/retracted facts,
  private conversations and workforce originals/notes must never enter factual report content.
- **FR-004**: Preserve the eight weekly sections in `docs/templates/weekly-status.md`,
  with separate accepted milestones, actual effort, forecast, risks and missing inputs.
  Missing logs produce an explicit unknown update; elapsed time never proves progress.
- **FR-005**: Preserve the six-section executive narrative and appendix in
  `docs/templates/executive-report.md`; show unavailable support/expansion data as
  unavailable or explicitly omitted with reason, without implementing later features.
- **FR-006**: Calculate period effort/variance and comparable metrics deterministically
  with versioned formulas, units, scope, denominator and source cutoff. Distinguish
  forecasts from realized outcomes; no inferred ROI, maturity averaging or mixed-currency totals.
- **FR-007**: Keep immutable revisions and published versions with exact source,
  template, brand, audience and content identity. Draft edits cannot introduce accepted
  facts; any added factual claim must cite eligible reviewed inputs or remain an explicit gap.
- **FR-008**: Canonical `mcteer` alone may approve/reject publication, approve recipient
  policies and authorize external sends. Every decision binds an exact preview,
  version, actor, rationale and request identity; internal visibility alone grants no approval.
- **FR-009**: Maintain explicit versioned recipient policies bound to customer,
  report scope, audience, sender and timezone/cadence. Recipient additions, scope,
  audience or sender changes require renewed approval; pause/revoke is immediately effective.
- **FR-010**: Generate weekly drafts under visible, revocable schedules. Initially,
  each external send requires mcteer review of its exact publication and recipient
  set; a draft schedule grants no unattended send authority.
- **FR-011**: Deliver reviewed weekly or executive reports by email, using the exact
  approved rendered content and attachments. Keep generated, approved, queued,
  provider-accepted and delivered states separate; record per-recipient attempts and receipts.
- **FR-012**: Deduplicate generation by scope/period/audience and sends by publication/
  recipient identity across recipient-policy versions. Retry definitive non-acceptance
  with the same identity; uncertain outcomes may only use verified same-key recovery
  within the provider deduplication window or evidence-based reconciliation afterward,
  never blind resend after restart or deduplication expiry.
- **FR-013**: Produce a standalone executive PDF and editable 16:9 presentation from
  the same structured revision; body text, tables and chart data must remain editable
  in the presentation. Retain accessible reading order, selectable PDF text and source labels.
- **FR-014**: Version and validate approved brand assets, Geist typography, template
  layouts, required sections, clipping, chart labels, page/slide breaks and links
  before publication. Synthetic previews cannot masquerade as brand-approved releases.
- **FR-015**: Build distinct customer/partner-delivery, internal account-team and
  leadership projections before generation. All exclude private conversations,
  individual workforce evidence and restricted finance. Partners may read only
  published delivery projections of currently assigned customers and cannot manage policies.
- **FR-016**: Restrict recipient addresses, provider identifiers and delivery diagnostics
  to authorized internal operators; never expose them in partner report metadata,
  source URLs, logs or downloadable document properties.
- **FR-017**: Recheck exact source eligibility on every read/release and immediately
  withhold invalidated derived text/files before asynchronous cleanup. Preserve minimal
  allowed audit identity; already-sent copies retain correction history and are not silently rewritten.
- **FR-018**: Publish corrections as new labeled versions referencing the superseded
  publication with new review/send authority. Surface late source changes and affected
  unsent/sent reports; never resend the original silently.
- **FR-019**: Bound generation, rendering, queues, retries, schedules, input/output
  sizes and retention. Expose actionable pending, blocked, cancelled, failed and
  uncertain states with metadata-only telemetry and operator recovery.
- **FR-020**: Present reports, review, recipient policy, schedules and history in the
  established workspace design with title-case labels, useful empty/error/denied
  states, keyboard access, focus management and mobile layouts.
- **FR-021**: Prepare reports deterministically from reviewed structured inputs and
  bounded author annotations. Report preparation and delivery make no new model
  calls and expose no agent mutation/send tools. Preserve the selected Turi model
  and existing conversation behavior; agent-authored report prose is a later extension.
- **FR-022**: Use explicit recoverable storage/schema changes and feature readiness
  gates. Preserve existing data and workflow stores across upgrade/recovery; disabled
  new work must still allow necessary status, reconciliation and cleanup.
- **FR-023**: Prove audience isolation, exact review, source withdrawal, deterministic
  metrics, artifact quality, retry/recovery and UI behavior using synthetic fixtures,
  targeted automated checks, actual file rendering and CLI Playwright/WebKit. Record
  actual provider/hosted checks separately from mocks and local tests.
- **FR-024**: Provide an operational setup/release record for sender verification,
  brand approval, bounded test recipients, private storage and worker readiness.
  Missing external configuration blocks affected sends/releases with a clear status,
  while preview drafting and local validation remain usable.

### Key Entities

- **Report Scope**: Customer, engagement/workload selection, kind, period/timezone and audience.
- **Report Revision**: Structured sections, claim/source lineage, calculations, cutoff, template/brand identity and draft state.
- **Publication**: Exact approved revision, artifact identities, decision and optional correction predecessor.
- **Brand Profile**: Versioned assets, typography/layout rules, provenance and approval for report use.
- **Recipient Policy**: Reviewed exact addresses, customer/scope/audience, sender, cadence and pause/revocation state.
- **Draft Schedule**: Visible period selection and next due time; duplicate-safe draft preparation, with no send permission.
- **Delivery**: Exact publication and recipient-policy binding, per-recipient attempts, provider evidence and reconciliation state.
- **Dependency/Audit Record**: Restricted exact source/decision lineage and invalidation/correction relationships.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In six weekly acceptance cases (normal, empty, partial, pending
  correction, late correction and replaced baseline), every published factual or
  numeric statement is traceable to eligible inputs and every required section is present.
- **SC-002**: The identity/audience/withdrawal matrix produces zero unauthorized
  content, recipient or restricted-metadata disclosures, including reads, downloads,
  replay, rendering and queued delivery races.
- **SC-003**: Duplicate requests, simultaneous workers, partial recipient failure,
  timeout/restart and expired provider deduplication tests produce zero duplicate
  confirmed sends; every unresolved outcome is visibly uncertain, never falsely delivered.
- **SC-004**: All pages/slides of six representative executive fixture pairs pass
  content parity and visual inspection; PDF text is selectable and presentation
  text/tables/charts are editable, with zero clipping or illegible labels.
- **SC-005**: At the documented synthetic workload of 1,000 engagements, 50,000 time
  revisions and 20,000 delivery revisions, five concurrent readers complete report
  lists/details/review acknowledgements at p95 ≤2 seconds; deterministic weekly
  drafts finish ≤30 seconds and executive artifact pairs ≤120 seconds at concurrency two.
- **SC-006**: All four CLI WebKit combinations (desktop/mobile, light/dark) pass
  reporting journeys with zero serious/critical accessibility findings and no page overflow.
- **SC-007**: Explicit empty/prior-schema upgrades and paired recovery preserve
  publications, pending work, send identities and existing feature data; cancellation
  or restart never causes a model call or an unconfirmed resend.
- **SC-008**: A controlled end-to-end release check records one real authorized test
  email and actual PDF/presentation inspection, separately from local transport
  simulation. Report preparation and delivery invoke no model and grant no new
  agent authority; local evidence does not claim hosted readiness.

## Assumptions

- 008 merged in PR 16; its existing reviewed logs, outcomes and estimates are the
  authoritative delivery inputs. Historical validation is not proof of 009 behavior.
- Continue the mcteer-only approval model; no new customer authentication or role delegation.
- Use email as the first delivery channel. Provider, sender verification and report
  brand profile workflow are resolved in research. Actual sender credentials and
  rendered brand approval remain explicit implementation/release prerequisites.
- This slice uses synthetic/customer-public acceptance data. A private-data pilot
  still requires the outstanding organizational policy in decision D07.
- Published content and recipient payload retention use the bounded synthetic-demo
  policy in the plan; it is not approval for a private-customer rollout.
- Default weekly schedule prepares the previous complete week on Monday at 09:00
  in its configured timezone. Monthly/quarterly drafts are requested explicitly.
- Report authors may select narrower scopes and include clear gaps; output limits
  must yield an explicit error or reviewed continuation, never silent omission.
- Implement local/disposable acceptance first. Preview/Production migration or
  hosted delivery readiness is a separately recorded release action, not proved by local tests.
