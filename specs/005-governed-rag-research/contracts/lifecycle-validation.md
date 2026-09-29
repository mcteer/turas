# Lifecycle and validation contract v1

## Release and invalidation

Use current policy locks and source generations for intake, candidate selection,
ranking release, citation resolution, tool context, every model step, emitted
chunk, title, generated history, reconnect and resume. Monotonic consumed-source
dependencies span previous turns and include transitive support and shared
lineage. Revocation after a chunk cannot recall that chunk; every subsequent
release rechecks the fence. Owner-authored text follows existing 004 retention,
while invalid generated content is withheld/redacted. Native state retirement
uses the existing quarantine path; no claim of remote provider deletion.

Commit correction/withdrawal/tombstone before asynchronous invalidation. A queued
or leased job cannot publish against old source/contract/authority generations.
Shared descendants fail current lineage checks immediately; worker suspension
and physical deletion can follow. Cancellation/revocation cannot be undone by a
saved successful native tool receipt. Apply the same checks to indexing commits,
research ingestion, candidate decisions, refresh and UI history/detail reads.

## Refresh and conflicts

Maintenance marks review-due state and invalidates expired context without live
egress. Refresh needs a new admitted research request, targets an exact source
revision and uses original date provenance. An unchanged body records retrieval
history without refreshing claim age; source date/claim changes create a new
checked attributed revision, invalidate dependent projections and suspend shared
publication pending review. User-origin remains Pending. Failed refresh preserves
old date/caveats and a visible failed/partial/unconfirmed outcome.

Conflict UI extends the existing typed endpoints, scoped period, rationale and
exact-version review model. Automated flags are unconfirmed. A confirmed material
conflict blocks current_fact use; discovery can show both authorized sides with
the caveat. Customer stewards resolve customer-scoped conflicts, including a
customer/shared pair; administrators resolve public-safe shared/shared conflicts.
Resolution never mutates an old source or quietly restores retracted support.

## Operations and recovery

Expose content-free counters for search mode/latency, authorized hit coverage,
citation denials, index lag, blocked egress, provider operation state/usage,
revocation fencing, cleanup retries and failed/unconfirmed work. Labels contain
no raw query, source text, private customer/URL identifiers or credentials.
Use opaque correlation IDs for restricted operator inspection; public UI receives
only its own run/decision receipts. Manual retry reauthorizes with a new key.

019–022 require explicit operator execution, vector-ready PG17 and restricted
runtime grants. New routes/lane readiness require schema022 and embedding contract
compatibility; earlier 002–004 read-only behavior stays available otherwise.
Test empty setup, 018 upgrade, lease expiry, stale generation, interrupted provider
receipt, exact replay and matched database/private-store restore on disposable
resources. Do not migrate/reset the selected application DB or remove `.eve`.
Rollback disables 005 intake, stops its worker lanes and restores a matched
snapshot if needed; it never drops populated feature tables to make tests pass.

## Evaluation fixture and gates

Version `005-retrieval-governance-v1` uses only synthetic customers and public
sources. It includes ≥40 judged answerable queries (≥8 paraphrase/semantic cases),
separate denial/sentinel cases, PDF/sheet/disjoint locators and source lifecycle
races. Judged relevance sets are authored before running the system. Recall@5 is
the mean fraction of each query's relevant source revisions represented among
the first five results; fixtures cap relevant revisions at five. Require ≥0.85,
all exact citation spans and zero denial leakage. Log mode/contract for each run;
lexical-only or fake-vector passes cannot satisfy the semantic gate.

Performance: load 5,000 eligible synthetic passages, run 100 measured queries
after 10 warm-up queries with five concurrent readers; p95 retrieval latency
after embedding ≤2 seconds. Also report embedding and end-to-end latency, timeout
and degraded counts. Do not count timeouts/degraded results as successful hybrid
latency samples. All 100 measured requests must complete hybrid search within
the configured query deadline to pass the benchmark. Measure newly eligible
projection ≤60 seconds and immediate denial with worker paused.

The 12 actual-output cases cover: semantic citation; multi-unit citation; partner
denial; cross-workspace shared reuse; stale/unknown abstention; material conflict;
recon identity; product practice; implementation fit/gap proposal; submitted URL
origin; partial/cancelled provider work; and prior-turn withdrawal/replay. Cases
score 0–2 each for fidelity, uncertainty, relevance and useful next action; each
must score ≥7/8 and pass every authority/origin/integrity/citation gate. A human
or implementation reviewer records case IDs, output references, rubric and
reasoning; expected-text fixtures are not the actual-output review.

Live evaluation uses a disposable environment and explicit `--live` admission.
At most 12 cases, five root model steps/case and 1,000 max output tokens/step;
retain the selected model in the isolated eval copy and enforce the step/output
settings using documented eve options. No unbounded model retries; record actual
usage including provider retry behavior and fail if it exceeds the declared cap.
Suite deadline 20 minutes; each research run retains its 120-second budget. Live
embedding evaluation permits ≤64 calls and ≤1,000,000 input characters, batching
up to 500 corpus passages plus 40 queries; the 5,000-passage performance corpus
may use deterministic vectors and cannot count as semantic proof. Provider/key
unavailability leaves the corresponding live gate incomplete, never mocked green.

CLI Playwright/WebKit uses the existing four desktop/mobile × light/dark projects,
keyboard journeys and axe (no serious/critical findings), with screenshots of
search/citation, publication/review, research progress/cancel and refresh/conflict.
Run applicable prior authorization/approval/artifact regressions once plus the
new checks, types/build and docs. Keep local/CI/live/hosted evidence distinct.
