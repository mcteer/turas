# Research: customer profiles, maturity and context review

Date: 2026-09-27. All planning uncertainties are resolved below. Decisions describe
003's intended implementation, not capabilities already shipped.

## 1. Extend the existing application and persistence

**Decision:** Keep Node 24, TypeScript 7, Next.js 16.3.4/React 19.2.6, the locked
eve 0.67.x dependency, PostgreSQL 17, `pg`, Zod and `node-pg-migrate`. Add profile
domain modules under `lib/server/profiles/`, typed contracts under `lib/contracts/`
and customer pages under the existing workspace shell. No new service or package
is necessary. Retain `customer_references` IDs used by grants and conversations.

**Rationale:** The installed application already supplies authenticated sessions,
workspace/customer access, explicit migrations, HTTP envelopes and UI/test tooling.
The [Next.js security guide](https://nextjs.org/docs/app/guides/data-security)
recommends server-side authorization and minimal data transfer objects; this matches
the existing repository boundary. The installed guide at
`node_modules/next/dist/docs/01-app/02-guides/data-security.md` was also reviewed.

**Alternatives:** A separate profile service or document database would duplicate
authorization and deployment work. Copying the demo wholesale would import its
incompatible lifecycle and authorization assumptions.

## 2. One review lifecycle for typed profile records

**Decision:** Use stable profile records with immutable, schema-versioned typed
revisions, relational scope/permission columns and a current accepted pointer.
All manual factual payloads, including maturity and risks, start pending. Store
one initial accept/reject decision for each candidate and separate immutable
supersede/retract events. SC-003's single decision means a single initial review
outcome; it does not prohibit a later audited retraction.

**Rationale:** Product use, risks and maturity need the same exact-version gate.
A pending correction leaves the current accepted revision intact. Retraction clears
the pointer without resurrecting older revisions. A reviewer cannot modify and
accept a different payload under an existing candidate ID.

**Alternatives:** Mutable profile columns with a separate text-claim queue would
bypass approval for structured edits. Separate lifecycle engines for every record
kind would multiply race conditions and inconsistent review behavior.

## 3. Transactional authority, concurrency and retries

**Decision:** Adapt `lib/server/access/service.ts`: request UUID, canonical body
digest, optimistic accepted-head version, transactional receipt and audit. Use a
transaction-scoped request lock and insert a completed immutable receipt with the
mutation; never commit an unfinished reservation. Revalidate
session/membership/grant/steward authority inside each mutation. Lock the authority
rows and customer profile state before record rows, using the order documented in
the data model. Approval, old-pointer supersession, directory-name sync and context
generation changes commit together.

Candidate sequencing remains private so other contributors' pending submissions do
not change a partner-visible version. A source lifecycle event supports withdrawal
even when research has no accepted profile record. Source withdrawal and approval
share the customer-state guard, as do stewardship changes and decisions. Normalize
the affected existing conversation/access lock paths to the explicit order in the
data model; the current conversation-first order is not copied blindly.

**Rationale:** PostgreSQL row locks coordinate competing writers until transaction
end; a consistent order avoids introducing conflicting lock acquisition paths.
See [PostgreSQL 17 explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html).
Retries return the prior receipt only after current authorization succeeds.

**Alternatives:** Last-write-wins loses reviewer decisions. HTTP-only idempotency
does not cover tool retries. Serializable isolation for every profile read adds
retry complexity where scoped write locks suffice.

## 4. Partner projection and private provenance

**Decision:** Filter by current workspace/customer access, record audience and
lifecycle before search, counts or pagination. Partners see accepted delivery
facts from any contributor, eligible delivery research, and their own pending or
rejected submissions. New candidate audience defaults to `internal`; the steward
confirms a delivery classification when approving. Internal operations record
categories cannot be marked delivery-visible. Source excerpts, conflict links and
review rationales receive their own projection; a visible fact does not open its
private chat or internal source document.

**Rationale:** A contributor's identity does not determine an accepted fact's
usefulness. Acceptance and audience are distinct decisions. Explicitly submitting
a chat claim shares only that exact claim and source excerpt; conversation ownership
from 002 remains intact. Partner decision responses contain a reviewer-authored
public reason, while private review notes remain internal.

**Alternatives:** Redacting after retrieval leaks counts and snippets. Sharing whole
source conversations violates private ownership. Automatically exposing every
accepted record would reveal internal staffing/utilization and reporting metrics.

## 5. Independent research without introducing 005

**Decision:** Implement a trusted domain ingestion contract and deterministic
synthetic/public research fixtures in 003. The UI can inspect these records; all
human-entered links and research corrections use the manual pending path. Browser
requests and model tools cannot choose `independent_research` or `authorized_system`.
Actual discovery/fetch/index tools remain 005. Trusted ingestion requires retained
passage, source identity, scope and content checks and cannot infer private facts.

**Rationale:** This makes the research display/eligibility contract testable without
pretending a manual “research” form independently verified its own content.

**Alternatives:** A user-selectable research-origin flag bypasses the gate. Building
a web researcher now expands the authorized slice and duplicates 005.

## 6. Deterministic evidence and maturity models

**Decision:** Implement `evidence-quality-v1` from `docs/evidence-policy.md` with
stored R/D/C inputs and rating rationales, a trustworthy date basis and information
type. Compute freshness and Q at a supplied `asOf` time; keep historical scoring
snapshots. An expired explicit review date makes evidence stale and caps F at 1;
unknown/invalid dates remain F=0. A score cannot override acceptance or permission.

Keep six independent maturity dimensions and a separately justified journey stage.
Adapt only the six-stage definitions, dimension descriptions and evidence principles
from the legacy maturity skill into an authored rubric; exclude its product lists,
research integrations and later delivery-planning behaviors. The initial rubric is
a versioned baseline, not a calibrated model of Vercel customers.

**Alternatives:** Persisted freshness alone never ages without a job. Automatic
stage averaging confuses independent capabilities. Copying old persisted stage
enums reintroduces the maturity/engagement conflict recorded in the legacy review.

### Rating ownership decision

Ratings are immutable candidate inputs confirmed by exact steward acceptance;
trusted fixtures capture the same envelope and ingest actor. Unknown inputs remain
explicit zero/unknown values. Corrections create new revisions; a separate mutable
rating endpoint would bypass the existing exact-review lifecycle. See the
[data model](data-model.md) for fields and authority. Canonical record keys also
prevent competing roots from producing multiple current identities or assessments;
observation dates are historical metadata, not a current-value selection rule.

## 7. Bounded eve tools and stale conversation context

**Decision:** Add ordinary context-read and pending-proposal tools backed by the
same profile domain services. Resolve authority from the bound conversation/attempt,
never tool arguments. No approval/retraction tool or integration is required.
Installed eve docs reviewed: `docs/README.md`, `tools/overview.mdx`,
`concepts/context-control.md`, `instructions.mdx`, `guides/dynamic-capabilities.md`
and `guides/hooks.md`, all under `node_modules/eve/`.

Use documented dynamic user-role instructions at `turn.started` for the initial
bounded snapshot, with a persisted receipt. A `step.started` hook throws if the
receipt or current authority/generation is invalid, before each model call. Keep
the native user text unchanged because existing attempt and projection digests bind
it. Test hook ordering and failed injection against the installed runtime.

**Rationale:** Tool results and compacted history persist; public hooks observe
events but do not provide a safe history-filtering seam. Re-reading current context
alone cannot remove old accepted facts already present in a native session.

**Decision:** Bind each conversation and attempt to a server-derived context
generation and freshness deadline. Use separate internal and delivery generations
so hidden internal writes do not disclose activity to partners. Invalidate stale
continuations, tools, native reads/replays and further stream release. Offer an
explicit new conversation with a fresh native session and no imported summary.
Historical app messages are retained, but stale generated/tool bodies are withheld
from subsequent client reads; user-authored messages remain owner-only and currently
customer-authorized. Keep clear/reset native routes denied.

**Alternatives:** Prompt instructions cannot erase model history. Rebinding an
existing conversation would break the one-native-session assumption in binding,
reconciliation and projections. Full dependency-aware history reconstruction is a
later optimization, not needed to meet the current safety boundary.

## 8. Migration and verification scope

**Decision:** Add migrations after 006, preserve every existing migration hash,
update readiness and runtime grants, and protect revision/event content from update
or delete. Existing synthetic directory names become explicitly attributed baseline
records; no maturity or product use is inferred. Route ordinary rename/create
operations through pending review; constrain demo bootstrap commands to fixed
synthetic provisioning and never use them to overwrite accepted profiles.

**Decision:** Verify database races, partner field/source projection, tool authority,
context invalidation, and WebKit interaction in the existing test suites. Use
synthetic fixtures and opt-in live behavior evaluations with a recorded budget.
Human walkthrough targets require real participant evidence; automation cannot
claim SC-001/SC-006 completion on their behalf. No hosted validation or deployment.

**Alternatives:** Readiness based only on existing 006 lets partial migrations serve
unsafe profiles. Happy-path UI tests cannot prove authorization. Declaring five
reviewers simulated by tests would misstate the usability evidence.
