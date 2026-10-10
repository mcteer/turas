# 014 Data Model and Bounds

Versions: `learning-v1`, `learning-evaluation-v1`, `learning-rubric-v1`,
`learning-metrics-v1`. Existing `knowledge-v1` reader projection is unchanged.
New tables are scoped by environment/workspace with composite foreign keys; typed
source references retain exact revision, generation, digest, scope and earliest
validity/purge deadline. Raw prose lives in separate purgeable payloads.

## Shared constraints

These bounds are normative and repeated in implementation tasks where enforced.

- **C01**: IDs are UUIDs; generations are integers 1–9007199254740991; digests are 64 lowercase hexadecimal characters; timestamps are UTC.
- **C02**: Feedback text is 1–2000 characters, disposition rationale is 1–2000 characters, and a feedback request is at most 16 KiB with exactly one typed target.
- **C03**: Existing candidate payload limits remain 20 KiB total, title/product version 1–200 characters, seven narrative fields 1–2000 characters, and 1–20 distinct eligible originals from one customer.
- **C04**: List limit is 1–20, opaque cursor at most 512 characters, search at most 200 characters, and private response at most 128 KiB; reject oversized work without silent truncation.
- **C05**: A draft has at most 6 paid steps, 6 evidence reads, 200 dependencies, 24576 cumulative input bytes, 4096 requested output tokens per step, 8192 cumulative observed output tokens including reasoning, a 120-second dispatch deadline and a 5-minute preparation TTL.
- **C06**: An evaluation has exactly 8 ordered cases and 2 arms per case, at most 16 paid calls, one step and zero tools per arm, 24576 input bytes and 8192 observed output tokens per arm, and a 40-minute batch deadline with one active arm at a time.
- **C07**: USD budgets are positive decimal strings with at most 6 fractional digits and a maximum of 25 USD per operation; reservations and usage use integer micro-USD and never treat unknown cost as zero.
- **C08**: Each case review has four integer scores 0–2 and explicit safety, citation and authority pass flags; every candidate total is at least 7/8, no case score regresses and at least one intended-improvement case increases.
- **C09**: Measurement values are unsigned decimal strings 0–1000000000 with at most 6 fractional digits; rate numerators/denominators are integers 0–1000000000 with denominator greater than zero and numerator no greater than denominator.
- **C10**: A measurement contribution has exactly one customer, one metric protocol, one completed UTC quarter and two 14-day windows; at most 20 accepted outcome/source references and 100 predeclared workload identifiers support the whole population.
- **C11**: A cohort requires at least 5 independent eligible customers and at most 10000 contributions examined; one immutable release family per workspace/metric/quarter spans all protocol versions, with no exact counts or replacement subset output.
- **C12**: Maintenance handles at most 100 records or 10 seconds per tick, runs at least every 60 seconds, and retries transient failures after 1, 5 and 15 minutes before requiring operator review.
- **C13**: Obsolete private payloads expire within 90 days, globally invalidated payloads within 24 hours or an earlier source deadline, and eligible audit metadata is minimized after 365 days; request tombstones last for the environment lifetime.
- **C14**: Admission allows 1 active draft per actor/customer, 1 active evaluation per workspace, 30 new learning writes per actor per minute and 120 per workspace per minute; retries/reconciliation do not consume new-work quota.

C03 reuses the seven fields problem/prerequisites/solution/reasoning/applicability/
limitations/validation. Existing source limits remain stricter when applicable.
C05 observed-token overflow is a terminal limit breach, not a billing guarantee.
C06 uses the C05 120-second per-arm dispatch ceiling and 4096 requested output cap;
16 arms have at most 32 minutes dispatched time inside the 40-minute batch deadline.

## Records and relationships

| Record family | Required data and invariants |
| --- | --- |
| `learning_workspace_state` | Workspace admission generation, enabled state, immutable gate activation time, review/protocol versions; disable does not disable withdrawal or cleanup |
| `learning_feedback`, revisions, payloads, dispositions | Author membership, exact target kind/ID/revision/digest, optional source customer, current generation, observation category, C02 body; immutable edit/disposition history; author-private plus authorized internal reviewer access |
| `learning_feedback_links` | Explicit steward link to an existing knowledge contribution/revision; target authorization separate from feedback-author access; public author view exposes only safe disposition, never private candidate ID/body |
| `learning_candidate_reviews`, payloads, dependencies | Knowledge revision, sanitized digest, exact original closure digest, rights-review digest, authority generation, reviewer, rationale/checklist and accept/reject; only active accepted review can admit evaluation |
| `learning_bindings`, draft attempts, attempt payloads | Fresh owner-private conversation, immutable purpose, actor/customer, exact selected source closure, optional feedback IDs, native session/turn, context counters, deadline and budget account |
| `learning_evaluations`, cases, arm attempts, case reviews | Candidate review, baseline publication/generation or explicit none, fixed case manifest, fixture/rubric/prompt/model/source digests, per-arm attempt and capture digest, per-case human assessment; no client-provided authoritative pass status |
| `learning_budget_accounts`, reservations, settlements | Admitted USD limit and reviewed price contract; step identity, pre-I/O reservation, provider generation identity when supplied, actual usage/cost or unknown, conservative bound decision with evidence and actor; no duplicate settlement or auto-redispatch |
| `learning_release_decisions` | Exact evaluation/review/candidate/baseline and final admin decision, publication generation, optional rollback-from ID; committed atomically with existing knowledge decision/publication |
| `learning_legacy_heads` | Activation snapshot of exact pre-014 published heads; grants no republish permission and retains existing source fences; private status is `not_evaluated_under_014` |
| `learning_measurement_contributions`, revisions, payloads, approvals | Canonical customer, metric/version/quarter, paired observations, population/workload manifest and accepted field locators, exact outcome/original closure, separate reuse review; conflicting duplicates suppress the entire customer's eligibility |
| `learning_cohort_families`, releases, dependencies | Unique workspace/metric/quarter regardless of protocol version; fixed participant manifest privately retained, formula/version, rounded result, release receipt, active/withheld state; immutable ledger survives source/payload deletion |
| `learning_refresh_jobs`, cleanup jobs, native retirement receipts | Fixed admitted scope, deduplication key, current initiating authority, next attempt/deadline, no external call without existing research admission; earliest deadline never increases |
| `learning_command_receipts`, audit metadata | Actor/action/request identity, keyed payload digest, expected generations, terminal disposition; content-free immutable identity separate from expiring payload; lost acknowledgment reconciliation and explicit abandonment |

Read operations reauthorize the actor and exact target before exposing private
payloads. Partner feedback on a checkpoint must belong to that member; same-org
access does not broaden it. Internal feedback reviewers need current access to the
underlying target/customer; inaccessible bodies are withheld. Sanitized shared
knowledge feedback needs only current access to that publication. A partner never
receives a private candidate through a 014 feedback link or another author's issue
even if both refer to the same guide. Existing authorized 005 contribution reads
and authoring remain unchanged; they confer no access to internal 014 evaluations.

Existing review checks alone do not establish an immutable rights grant. Bind an
explicit 014 reuse decision and its generation into the candidate closure; revocation
invalidates downstream review/evaluation/release synchronously. Accepted originals
retain their independent approval lifecycle. Loss of a reviewer's authority blocks
a pending release until a current administrator re-reviews it; it does not by itself
revoke an already authorized historical publication. Explicit reuse-rights loss or
source invalidity still withholds that publication.

## State transitions

- Feedback: `open → under_review → linked | deferred | dismissed`; explicit reopen
  creates a new disposition event. Editing text creates a new immutable revision.
- Candidate: existing 005 draft/submission lifecycle; new accepted review admits
  evaluation, never publication by itself. Candidate edit invalidates prior review.
- Attempt: `prepared → admitted → running → completed | failed | cancelled |
  unconfirmed | invalidated`. Cancellation fences new dispatch and release first;
  uncertain provider usage remains unsettled until reconciliation.
- Evaluation: `prepared → running → awaiting_review → passed | failed`; any relevant
  dependency change makes it `ineligible`. Cancelled/missing arms cannot count as
  passed. A rerun is a new evaluation revision with all 16 arms, a new explicit
  budget and visible prior outcomes; no replacement of only failed arms.
- Release: only a current passed evaluation plus the final admin decision changes
  the 005 publication head. Withdrawal targets the published revision/generation,
  independent of newer candidates. Rollback creates a new candidate revision.
- Measurement: `proposed → approved | rejected → withdrawn` with immutable revisions;
  correction requires a new review and cannot change an already released cohort.
- Family: `unreleased → released → withheld`; failed eligibility before any disclosure
  leaves it unreleased and may be retried after correction. Once released, no new
  numeric output is permitted for the family, including after protocol changes.

## Concurrency, privacy and retention

Use actor/scope/admission/target mutexes in a documented deterministic order; model
reservation commits before I/O, and release transactions lock current source heads,
rights, reviewed candidate, evaluation and publication generation. Cohort family
lock serializes eligibility capture and first disclosure across all readers.
Withdrawal locks the actual published head; it never waits for paid evaluation.

C13 is a maximum for new payloads only: stricter existing 005 cleanup deadlines win.
On global invalidation withhold immediately, schedule earliest purge and native
reset, then minimize metadata only after payload/native cleanup is confirmed.
Source and family tombstones carry no customer prose. Actor-only access revocation
blocks that actor and their active jobs, without globally deleting valid publications.
Logs/metrics use action/error class, counters, duration and cost status; no customer,
source, partner, feedback or prompt text in labels. Request HMAC keys use the existing
versioned-key pattern; retain old keys through pending receipt reconciliation and
reject retired-key replay rather than treating it as fresh work.

## Migration sequence and release gate

Plan explicit migrations 052 (feedback/reviews/receipts), 053 (native bindings,
paired evaluation/budget/release guard), 054 (measurements/cohorts/maintenance).
Reconcile numbering with main before implementation; never modify an applied hash.
Refresh `migrations/manifest.json` and `scripts/db-role-setup.sql`; enforce immutable
identity and payload-only purge grants with fixed-search-path functions.

Migrations are additive with the gate inactive. An explicit operator activation
transaction snapshots exact legacy published heads and sets the irreversible gate
activation marker. New code blocks publishing when schema or learning readiness is
missing. After activation, a database guard on new/changed published heads requires
an exact 014 release decision even if an old application writer runs. Disabling new
work blocks publish/evaluate/draft but permits withdrawal, reconciliation and purge.
Do not reset the activation marker to recover. Forward repair preserves ledger,
family, budget and native-workflow identity; schema downgrade is not rollback.
