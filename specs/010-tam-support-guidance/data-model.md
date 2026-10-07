# Data Model: Support Guidance v1

Status: implemented additive model; installed only through explicit migrations in selected environments. References: [spec](spec.md), [API](contracts/support-api.md), [advice](contracts/advisory-context.md).

## Records and Relationships

| Storage group | Fields / purpose |
| --- | --- |
| `support_scopes` | UUID id; environment, workspace, customer, nullable workload; generation; created/updated timestamps. Unique tuple with null workload treated as equal. Read of absent scope returns an empty view; first explicit save/prepare command creates it idempotently. |
| `support_records` | UUID id; scope; kind assessment/action; immutable audience internal/delivery; current revision, accepted revision, optimistic version; lifecycle metadata. At most one assessment record per scope/audience. Action identities remain stable across revisions. |
| `support_revisions` | Immutable id/record/ordinal/author/content digest/template version/created time; selected engagement identities and metadata needed for invalidation. No title, narrative or URL in metadata. |
| `support_payloads` | Exact revision id and digest plus structured assessment/action payload. Immutable while retained; only narrowly granted retention functions may remove it. |
| `support_source_dependencies` | Revision, original kind/id/revision/generation/digest/locator; optional engagement and baseline; indexed reverse source lookup. Workload and audience eligibility are checked independently of IDs. |
| `support_review_decisions` and `support_decision_payloads` | Immutable exact revision/decision/reviewer/source digest/time identifiers; rationale in separately purgeable payload. Acceptance moves the accepted pointer atomically. Withdrawal clears eligibility without rewriting old decisions. |
| `support_command_receipts` | Environment/workspace/member/request key unique; request digest, operation, exact affected ids, categorical outcome and time. No customer prose or echoed request JSON. |
| `support_advice_bindings`, `support_advice_attempts`, `support_advice_dependencies`, `support_advice_payloads`, `support_model_step_receipts` | Fresh owned conversation binding, immutable scope/audience/input selection, counters/deadline/native identities, original source and collection-generation fences, purgeable instructions/snapshot/output, metadata-only paid-step/terminal receipts. Reuse shared response projections rather than a second chat history. |
| `support_cleanup_jobs` | Exact payload kind/id/digest and cause generation; due time, lease token/deadline, bounded attempt count and content-free terminal outcome. Jobs never carry customer prose or impersonate a user. |

Foreign keys include the environment/workspace/scope association where relevant. Cross-customer links must fail domain validation and cannot be inserted through broad runtime grants. Record creation, heads and decisions are transactional. Runtime has no DDL and no direct payload update/delete privilege.

## Structured Payloads

### Assessment

`schemaVersion: support-v1`, `rubricVersion: support-readiness-v1`, title, observationDate, nextReviewDate, timezone, selectedEngagementIds and exactly six checks. Check keys: `operating_ownership`, `support_escalation`, `observability_triage`, `change_recovery`, `runbooks_knowledge`, `handoff_obligations`.

Each check has status `ready | gap | unknown | not_applicable`, rationale and references into the revision's direct evidence set. A ready/gap check needs eligible direct support. Unknown has a discovery need. Not applicable needs an exact reviewer rationale. Maturity is read from existing accepted `maturity_assessment` profile revisions, kept distinct from these checks.

### Action

Title, desiredOutcome, rationale, validationCriterion, priority `high | normal | low`, owner, nextReviewDate, timezone, disposition, dispositionRationale, optional revisitDate, optional completedDate and outcomeSourceKeys. Optional `basedOnAssessmentRevisionId` is a contextual dependency, not original factual evidence; its underlying sources are still retained. Initial proposed actions have disposition `open` and no accepted pointer.

Owner is one of: active workspace membership with current customer eligibility; customer operating role with an accepted stakeholder/profile source; or unassigned with an explicit reason. A suggested owner does not grant permissions, assert agreement, reserve time or create a staffing assignment.

Optional escalation: trigger, observedImpact, accountableRole, routeKnown boolean, route or unknownRouteReason, evidenceChecklist, nextCheckpointDate. Optional handoff: `human_reported`, occurredAt, externalReference and supportingSourceKeys. The proposer/reviewer identities come from the authenticated command, never a client field. No `ticketResolved`, providerReceipt or externallyVerified flag exists.

### Sources

Original types are `accepted_profile`, `approved_excerpt`, `verified_research`, `shared_knowledge`, `execution_record`, `milestone_baseline`. Each includes stable source id, exact revision, generation, digest and a valid locator where applicable. Execution types also require their engagement identity. Resolve sources through the existing authority-aware services; do not accept caller-provided excerpts/digests as proof. Citation IDs are receipts, not permanent permission.

Customer-wide scope may use customer-level evidence and explicitly selected engagements from that customer; workload scope allows customer-level evidence and that workload only. Resolve each execution dependency with its own engagement/workload, not by substituting the support scope's nullable workload. No implicit all-engagement selection. Source expansion is bounded and cycle-checked. No support-action-to-action citation graph is introduced.

## Validation Constraints

These are the authoritative constraints; schema/domain tests exercise every boundary.

| ID | Exact constraint |
| --- | --- |
| C01 | Scope and record IDs are UUIDs; scope uniqueness is environment/workspace/customer/workload with null workloads equal; audience is immutable internal or delivery. |
| C02 | Trimmed titles are 1–200 characters; rationale and desired outcome are 1–2,000; validation criterion is 1–2,000; owner/role labels are 1–200; unknown reasons are 1–500; requests are at most 65,536 UTF-8 bytes and reject unknown fields. |
| C03 | Observation/completion dates are valid ISO dates no later than today in a valid IANA timezone; next-review/revisit dates are valid ISO dates after observation; handoff timestamps cannot be future dated. |
| C04 | Each assessment contains exactly the six distinct readiness keys; status is ready, gap, unknown or not_applicable; ready/gap require at least one eligible supporting reference. |
| C05 | Select 0–10 distinct same-customer engagements, 0–20 distinct direct source revisions and at most 200 transitive dependencies; list limits are integers 1–50, default 20. |
| C06 | Owner is exactly one of eligible membership, evidenced customer role or unassigned with a reason; an owner selection never grants authority. |
| C07 | Disposition is open, in_progress, blocked, deferred, completed or dismissed; deferred requires revisitDate; blocked/dismissed/reopening require rationale; completed requires completedDate and at least one eligible dated outcome source. |
| C08 | Escalation requires trigger, impact, accountable role, evidence checklist and checkpoint; provide exactly one of known route or unknown-route reason; route/checklist text is at most 2,000 characters each. |
| C09 | External references are HTTPS URLs of at most 2,048 characters, without credentials, query or fragment; never fetch or unfurl them; external acknowledgement and resolution remain unknown. |
| C10 | Commands require UUID requestKey and integer expectedVersion ≥0; review additionally requires exact revisionId and sourceDigest; same key/different digest conflicts. |
| C11 | Advice permits six steps, six reads, 4,096 output tokens per step, 24,576 context bytes, 200 dependencies, five admissions per rolling hour/user, one active scope/user attempt and a 120-second deadline. |
| C12 | Withhold invalid content immediately; purge invalidated payloads within 24 hours, abandoned/rejected drafts after 90 days and advice content after 30 days; retain content-free audit/receipt identities for 365 days. |

Additional interpretation: completing an action also obeys source-quality/directness checks; merely attaching a ticket URL is not an outcome source. Free text longer than a field's limit is rejected, not truncated. Dates displayed on historical accepted records may become overdue without mutating them. New proposals may deliberately preserve an older observation date; renewed review cannot pretend the source observation happened today.

## State and Effective View

- Revision: proposed → accepted or rejected; accepted → superseded on a new accepted revision, or withdrawn by mcteer. New drafts may be saved after rejection; accepting replaces only the exact previous head covered by expectedVersion.
- An action's accepted disposition changes only when its new revision is accepted. Reopening a completed/dismissed action means a new revision with `open`, new next review and a rationale; history keeps the earlier state.
- Effective readiness: first validate retained payload, permissions, sources and due dates. Any changed/overdue check yields `review_required`; otherwise any `gap` → `gaps`; else any `unknown` → `unknown`; else any `ready` → `ready`; else `not_applicable`. No accepted assessment yields `not_assessed`.
- Action effective state combines last accepted disposition with `reviewRequired`, `overdue`, `ownerUnavailable` and `contentUnavailable`. Source loss can withhold the title/body while retaining permitted content-free identity and historical disposition. An inactive owner raises reviewRequired; it does not silently reassign.
- Advice: prepared → running → completed, failed, cancelled, expired or unconfirmed. Context invalidation blocks future content release; terminal usage reconciliation still proceeds. “Unconfirmed” never authorizes another paid call.
- Cleanup: pending → leased → done, with expired leases reclaimable and exact target/cause rechecked. A delayed job cannot delete a newer revision or restore withheld content.

## Retention Details

Active eligible accepted content is retained until withdrawal or a governing source/retention event. Ordinary supersession of a support revision permits eligible history; loss/supersession of an original source invalidates dependent prose. Mere evidence aging does not physically delete evidence. Abandoned draft age is measured from its last explicit save, never background polling. Advice's clock starts at terminal settlement or deadline, whichever is first; an unsettled job cannot keep content forever. The earliest applicable purge deadline wins and retries cannot extend it.

After 365 days, remove receipt details and retain only an opaque keyed hash of the environment/workspace/member/request-key tuple in `support_expired_command_keys`. This content-free uniqueness fence lasts for the environment lifetime and contains no customer/record IDs, operation, request digest, timestamps or prose. Check it under the same command admission lock before receipt creation; expired keys return an expired-receipt conflict, never a new command. Hash-key rotation must preserve lookup of older fences. Verify late retry and concurrent cleanup/admission. Minimal audit needed by a still-retained accepted record remains referential metadata while that record exists; this narrow referential exception contains no prose, external URLs or request bodies. Terminal jobs are minimized with the same 365-day policy. Cancellation/disable do not suspend retention.

## Migration and Recovery

042 creates support scope/record/review/receipt/source/cleanup storage and narrowly granted maintenance functions. 043 adds support advice binding/attempt/dependency/step storage and extends the existing one-feature-per-conversation constraint. Add both to the manifest using exact checked digests. Validate prior 041 and empty upgrades, no changes to 001–041, runtime grant denial and mixed-binding races. Rollback is feature disable plus forward repair; destructive schema reversal is not a request handler operation.
