# 012 Reports, Private Export and Handoff Contract

Versions `gap-detail-v1`, `gap-portfolio-v1`; method versions `gap-impact-v1` and `gap-order-v1`. The [domain](domain.md), [HTTP/UI](http-ui.md) and [data model](../data-model.md) remain authoritative. No model, renderer, email/ticket integration, schedule or external fetch is introduced.

## Required documents

Map the existing [detail template](../../../docs/templates/product-gap-detail.md) and [portfolio template](../../../docs/templates/product-gap-summary.md) without dropping sections. Missing evidence is represented as unknown/unavailable with a reason; it is never filled with invented narrative. The deterministic composer combines reviewed authored fields and governed calculated values; authored judgments remain labeled.

| Detail v1 section | Required projection |
| --- | --- |
| Header | Canonical gap/revision, product/capability/version, report date, exact audience/classification, triage team, disposition, original source snapshot |
| 1 Problem | Reviewed missing capability, workflow, desired outcome |
| 2 Evidence and scope | Reproduction/constraints, documented limitation passages and product checks, confirmed versus suspected customer scope |
| 3 Impact | Distinct current confirmed/suspected-only and resolved-history counts, observed severity/consequences/burden, quality/confidence, explicit nonadditivity and no invented ARR |
| 4 Workarounds | Reviewed steps/limitations, feasibility, cost or unknown, operational burden and supportability |
| 5 Proposed capability | Reviewed proposal, workflow/user need, acceptance criteria, constraints/security/compatibility, alternatives; non-goals explicitly authored in constraints or unknown |
| 6 Engineering handoff | Requested decision, unknowns/questions, triage owner, permitted duplicate lineage; inert related references and no roadmap promise |
| 7 Evidence appendix and review | Visible source IDs/revisions/locators/dates/quality/classification, exact customer disclosure, reviewer; only separately attributed handoff history as of this report's preparation |

| Portfolio v1 section | Required projection |
| --- | --- |
| Header | Cutoff/comparison interval, selected products/gaps/dispositions, audience, authorized scope, report/template/method version, preparer/review state |
| 1 Executive summary | Deterministic recurring blockers and decisions requested; comparable changes or unavailable |
| 2 Gap table | Canonical identity, product/capability, reviewed summary/severity, distinct impact categories, first/last known observations, trend, workaround, triage team/disposition and permitted detail reference |
| 3 Prioritization | Full qualitative ordering tuple and evidence freshness/quality flags; no invented weights |
| 4 Actions | Reviewed disposition, requested decisions, due review and human-reported follow-up where eligible |
| 5 Method and limits | Exact selection/cutoff, deduplication, current authorization, comparability, missing evidence/dates, corrections, lineage and nonadditive categories |

The detail view may describe any explicitly labeled gap kind. Product-gap portfolio selection rejects non-product kinds instead of silently excluding selected IDs. Links in exports are only approved safe source URLs or authenticated application references, never private storage/signed URLs or a public report. Do not promise that an engineering recipient has Turas login access; exported content is self-contained. Customer names/passages appear only within approved disclosure scope. A zero-gap portfolio still has all five sections, zero counts, method/limits, audience and review.

## Preparation and publication lifecycle

Admission checks current authorization, explicit IDs, C11/C12 bounds, quotas, schema/store/environment and input versions; persists one job/receipt with the immutable input binding. Reserve up to one active preparation per actor and five per workspace transactionally. Deadline is admission +30 seconds, including queue time; claim lease expires no later. Jobs have `queued → running → prepared | failed | cancelled`. Terminal states never auto-retry. Explicit new preparation requires a fresh request key after reconciliation, and report changes create a new revision.

The worker independently ticks within the existing reports-worker process; 009 disablement cannot suppress 012 cleanup/jobs. It locks/claims only same-environment jobs, verifies current submitting actor/session, constructs the full bounded original dependency union and current reviewed heads, then captures a governed snapshot. Any unknown/inaccessible selection rejects the whole job. Build canonical structured content and both export candidates within C13 size/deadline bounds. A deterministic serializer validates every required section, citation resolution, count/set parity, unknown label, safe link and audience/customer manifest before staging.

Stage exact opaque object IDs in the separate 012 catalog before writing. Reuse the existing low-level private report store with its environment marker, permissions, no-follow handling, exclusive writes, fsync and digest/size validation. The 012 adapter enforces its own smaller limits. Do not call 009's preparation/brand registration, artifact policy, renderer or send paths. Its `prepareReportStore` helper alone is reusable through the explicit gap-store preparation command.

Finalization reacquires the domain fence and verifies actor/session, all scopes, source dates/generations/digests, reviewed heads, relation generation, content/bytes, deadline and cancellation. Commit the prepared report revision and both private candidates atomically in the database; uncommitted files remain cataloged scratch and are never downloadable. Failure/cancel/lease expiry withholds candidates and marks exact objects for cleanup, without inferring success from an existing filename. Restart fails abandoned jobs and never regenerates automatically. Partial disk write, disk full, oversized serialization, worker crash and lost DB acknowledgment must reconcile to one terminal job and bounded cleanup.

A prepared report is viewable only through current authorized draft projections. No artifact candidate is downloadable before review. Approval preview binds exact canonical content and both artifact digests/lengths, report/relation/source versions, audience/team/named recipients/purpose, all included customers' explicit disclosure acknowledgments and template/method versions. Current mcteer approves/rejects with rationale and self-review when required. Approval creates an immutable decision plus release eligibility; it does not rewrite report bytes. Review identity/time are attached as a separately rendered authorized review envelope in-app and to the download receipt; the immutable candidate's review section names mcteer as the designated reviewer and says that approval is verified by that receipt. The in-app release envelope identifies the actual reviewer/approval time and links the digest-matched minimal download receipt; no approval is claimed merely by the candidate's designated-reviewer label. This avoids circular content/digest changes at approval.

A changed audience/customer disclosure, report revision, reviewed head, source eligibility/date or canonical relation invalidates approval before any new release. Generation and current validation checks are independent of maintenance flags. Do not hide unknown/invalidated selections by silently producing a smaller report. An expired report requires a new preparation and review, never a retention-extending rewrite.

## Export contract

Formats are UTF-8 `.md` and `.json`, with matching visible content, source labels and count values. JSON is the approved recipient projection/manifest with schema/template/method versions, cutoff, visible source revisions/digests and approved scope; it is not raw internal dependencies, private object keys or hidden-customer metadata. Escape Markdown/JSON text and URL syntax, reject unsafe/credential-bearing source links, omit raw HTML and code execution, and use a fixed opaque attachment filename. Each artifact carries its exact audience/confidentiality/use marker and unknown classifications. No fetch/unfurl is performed.

mcteer-only export admission binds current approved report/artifact identity and returns one minimal receipt. State is `ready → streaming → completed | interrupted | cancelled`, without holding one long database transaction across the socket. Before headers and each at-most-64-KiB chunk, recheck the current authority/source/relation/review/expiry/cancel fence. Increment state with expected versions; cancel closes the stream and denies later reuse. Revocation prevents all subsequent chunks; bytes already delivered cannot be recalled. An authorized reconnect after an interrupted stream reuses the same artifact/export identity with a fresh current fence and full-body restart, never a new preparation. Concurrent duplicate downloads cannot multiply receipts; export completion is server-observed transport completion, not a claim that a person read the file.

A minimal receipt records report/review/artifact identity, exact bytes digest/length, approved audience digest, requester and safe outcome. Exact replay preserves identity under current authority. Mismatched input conflicts; expired receipt returns a safe tombstone result. In-flight export stops on disable as well as revocation. Store identity/hash/size mismatch fails closed and is not repaired during a request.

## Human-reported handoff

The initial `handed_off` action binds an eligible approved unexpired report, both prepared artifact digests, the exact approved audience, event time and manual note/reference. It does not require claiming a platform download was the external delivery. No provider call, ticket write or email send occurs. Label every event human-reported; `acknowledged`, `investigating` and `resolution_reported` are attributed to the reporter and cannot appear as verified external state without separately eligible evidence.

C14 bounds apply. A follow-up or correction links the preceding event; a correction also identifies the event corrected and preserves its identity. Do not permit predecessor cycles, another report/audience, an event before its predecessor or a correction that changes the original approved audience; a changed audience needs a new report and approval. Only one initial handoff per report review/audience is allowed; recording the same real action again returns the existing identity or conflicts rather than inventing another send. Separately reported later activity uses a follow-up.

After report expiry/withdrawal, currently authorized mcteer may append a metadata-only follow-up/correction: safe kind/time/predecessor and changed-safe-state, with prose/reference/evidence omitted from storage. The ordinary note field is required only while full event payload is permitted; this explicit variant permits correcting the audit without resurrecting withdrawn content. All full-payload events remain subject to source eligibility and C14. New initial handoff or changed audience remains forbidden after expiry. Corrections and source invalidation mark previous handoffs `needs_human_follow_up`; no notification is sent. Engineering resolution never resolves customer impact, changes maturity or creates a product commitment; each customer needs an independently reviewed resolution observation.

## Retention, disable and recovery

C15/C16 specify retention/leases. Global invalidation withholds immediately and queues payload/file purge within 24 hours; per-actor revocation denies only that actor. A 30-day report expiry is measured from preparation, not approval/download/regeneration. Keep exact minimal identity/digest/audience digest/review/decision links under the audit policy; audience names, notes, source excerpts and report prose are payload, not permanent metadata. Handoff payload retention begins when superseded/obsolete, independently of report expiry, but globally withdrawn content purges within 24 hours. The metadata-only variant contains no C14 note/reference payload.

The 180-second cleanup lease claims at most 100 exact cataloged rows and renews/fences safely. Worker retries only idempotent cleanup, bounded to the next scheduled lease; never retries preparation or handoff. Delete only exact same-environment 012-cataloged object keys, never a directory glob or a 009 artifact. Database flags are reconciled after verified deletion; crash/ENOENT is safe, digest/environment mismatch quarantines with a safe operator failure. Clean expired previews, obsolete content, staged orphans, request receipts and diagnostics using separate metadata/payload grants. Disabled creation leaves these routines running.

Recovery verifies empty/047→049 migration, runtime least privilege, same database/workflow/store markers, receipts/tombstones, prepared reports and cancelled/expired jobs across restart. Do not roll back by deleting schema or changing the selected environment. Local/CI proof does not authorize a hosted migration or establish hosted worker delivery.
