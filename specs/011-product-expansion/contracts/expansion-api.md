# Expansion API and Domain Contract

Version `expansion-v1`. All transports call `lib/server/expansion/`; UI/eve/future
consumers cannot implement a second authority or calculation path. Dates and bounds
are normative in [data-model.md](../data-model.md).

## Routes and projections

| Route | Method / purpose |
| --- | --- |
| `/api/expansion/customers/[customerId]` | GET list or exact record detail; optional workloadId, disposition, recordId, limit, cursor; no cross-customer list |
| `/api/expansion/customers/[customerId]/owner` | GET assignment/version and eligible internal owner choices; POST assign/reassign/unassign with rationale, requestKey and expected assignment version |
| `/api/expansion/customers/[customerId]/evidence` | GET bounded lexical discovery, then current original-source citation verification; query 1–500 characters, limit at most ten; no provider calls |
| `/api/expansion/customers/[customerId]/preview` | POST exact proposal/decision preview with eligibility, missing qualification checks, current versions, original-source digest and related-set digest; no mutation |
| `/api/expansion/customers/[customerId]/commands` | POST strict discriminated command below |
| `/api/expansion/customers/[customerId]/advice` | POST prepare a fresh bound conversation for one scope and explicit inputs |
| `/api/expansion/receipts/[requestKey]` | GET own current-authorized receipt or unknown/expired outcome |

Use authenticated server sessions, same-origin/CSRF mutation guards, JSON content type,
streamed byte limits and no-store responses. Validate UUID/query/body before domain
execution. Scope/audience/actor come from current authorization; no client-supplied
role, owner override, environment or accepted flag. Partner requests return the same
hidden-record result as an unavailable customer, including lists/counts and tools.

Read quotas: 120 per user per rolling minute; mutation/preview 30 per user per rolling
minute; advice has its stricter hourly/active limits. Quota admission is persisted,
content-free and checked before expensive source resolution; it does not replace
transactional authorization. 50-row maximum lists use indexed scope filters and
bounded batches. Owner choices are same-workspace active internal memberships only.

A detail returns contractVersion, scope, current owner and assignmentVersion,
hypothesisVersion, working/decided revision IDs, decided disposition, reviewRequired
reasons, eligible payload(s) or withheld metadata, ranking tuple/explanation, source
quality/date projections, related records, permitted delivery links and allowedActions.
Allowed actions are helpful UI hints; every command rechecks authority. Lists exclude
withheld prose and hidden counts. History is paginated and never serves invalidated
payloads from immutable snapshots. Retrieval receipts expire independently of durable
original evidence references; re-resolve originals on each use.

## Commands

Every command has `contractVersion`, UUID `requestKey`, nullable UUID `workloadId`
and `expectedVersion`; create expects scope generation, record commands expect
hypothesis version. Decision commands also include `expectedAssignmentVersion`.
All command variants reject additional properties. Preview and commit use identical
validation except preview has no write or idempotency receipt.

| Operation | Required inputs | Result |
| --- | --- | --- |
| `save_hypothesis` | Content C03–C08, sources, selected engagements, delivery links; optional recordId for a new revision; related-set digest/acknowledgement when duplicate | New proposed record or working revision; last decision preserved |
| `decide_hypothesis` | recordId, exact current revisionId, decision qualify/defer/dismiss/reopen, rationale, full or metadata preview digest, expected assignment version; revisitDate for defer | Immutable exact decision and updated decided head/disposition |
| `save_suggestion` | attemptId, outputDigest, suggestionIndex, validated content edits and duplicate acknowledgement if needed | One proposed revision preserving eligible original suggestion lineage |

Advice preparation accepts contractVersion, requestKey, workloadId, expected scope
version, sourceRefs, selectedEngagementIds and selectedHypothesisIds. The server
creates and binds a fresh owned conversation atomically and returns conversationId,
bindingId and expiresAt; same-key replay returns the same current-authorized binding
rather than creating another conversation. It does not dispatch a model. The bounded
question is submitted through the existing governed conversation route. No attachment
or generic research/history is admitted. Selection above twenty existing hypotheses
requires explicit narrowing, never an implicit first-page snapshot.

The owner route uses the same receipt mechanism with `assign_owner`, nullable target
membership, expected assignment version and rationale. No owner auto-backfill; mcteer
can explicitly assign themselves. Removing an owner blocks all new disposition
reviews. Existing proposals and permitted reads remain available.

`qualify` validates C10 against original sources and active owner in the commit
transaction, not a client `supported` flag. Metadata-only preview permits defer,
dismiss and reopen after invalidation; it returns only permitted IDs/state/version
and never source-derived titles or rationale. Reopen cannot qualify; its result is
proposed, including a record whose old payload was purged. Saving fresh content is
then required before qualification. Current-owner self-review is allowed with rationale.

## Failure, replay and boundaries

| Outcome | Transport / behavior |
| --- | --- |
| Malformed/oversized | 400 / 413, bounded field errors without submitted content |
| Signed-out/revoked session | 401 |
| Visible internal record, insufficient decision authority | 403 |
| Missing, cross-customer or partner-ineligible record | generic 404 |
| Version/source/assignment/cursor/duplicate-set changed | 409; refresh exact preview, never silently overwrite |
| Qualification incomplete / invalid transition | 409 with allowed missing-check categories; no decision |
| Rate/budget admission denied | 429 with safe retry timing |
| Disabled or missing schema | 503; no automatic migration |
| Lost acknowledgement | UI retains request key and reads receipt; it does not submit a new key automatically |

Same actor/environment/workspace/key and digest returns the prior currently
authorized receipt, even if the current owner has changed; it never re-executes the
old decision. Different digest conflicts. Revoked actors cannot retrieve receipts.
After detail retention, an opaque expired-key match returns an expired-receipt
conflict rather than recreating the operation. Requests with different keys still
serialize on version and related-set locks. No HTTP/domain route performs external
sends, fetching of user URLs, CRM writes or acceptance in another domain.
