# Customer context and eve contract v1

003 adds two ordinary eve tools. They use installed `defineTool` guidance and shared
profile services. Existing disabled web, host/file and delegation tools stay disabled.
No integration or runtime-model change is required. Research discovery remains 005.

## Authority binding

The guarded channel creates an application-owned attempt authority reference from
the current login session, principal, membership, workspace, customer, conversation,
environment and context generation. Persist IDs, never cookies or credentials.
The tool resolves this binding through server-owned attempt metadata. Input cannot
select an actor/customer or trusted evidence origin. Recheck login expiry/revocation,
active principal/membership/workspace/partner organization, current grant, conversation
ownership and generation on every tool call and protected native operation.

At `turn.started`, use `agent/instructions/customer-context.ts` and the installed
`defineDynamic`/`defineInstructions` user-role mechanism to load a bounded projected
snapshot, persist its exact receipt/citations/generation/deadline and inject it as
labeled data. Preserve the native user message unchanged: existing attempt binding
and persistence verify that original text's digest. Keep root `instructions.md`.
At every `step.started`, an application hook must throw on missing/invalid snapshot
receipt, stale context or lost authority, preventing that model call. Test resolver
failure and hook ordering against the installed eve runtime; a failed dynamic
resolver alone is not the fail-closed boundary. Hooks cannot edit native history.

## `customer_context`

Input: optional record-kind filter, current workload ID and query (max 200 chars);
page limit 1–20. Workload must belong to the bound customer and be visible.

Output: contract version, safe customer/workload identity, `asOf`, `validUntil`,
opaque audience context version, at most 20 authorized entries / 24 KiB, safe
pagination/truncation indicators and known gaps. Each entry identifies its exact
record/source revision, accepted-manual versus attributed-research status, scope,
observation date, freshness, quality and limitations. A model-visible citation
refers to a stable authorized application source detail, not a private chat URL.
Omit unsupported/conflicted claims from settled facts; return only a safe limitation
about a relevant unresolved topic. Pending submissions are not returned by this tool.

## `propose_customer_context`

Input: supported record kind, workload, typed candidate payload, optional target
record/version and source message/span or authorized evidence IDs. Never accept
approval/retraction/stewardship, origin or actor fields. Internal users may propose
all allowed profile kinds; partners only delivery candidates for the bound customer.

Output: exact Pending revision ID, request receipt, scope and review-needed status.
The tool must say it saved a proposal, not changed accepted profile context.

For user claims, verify the source message belongs to this conversation's owner,
that the claimed span matches the persisted text, and store only the selected claim
as shared context. Generated assessment proposals are identified as assistant
proposals on behalf of the actor, never misquoted as a user statement or independent
research. Both origins follow the manual pending gate. Supporting evidence must
remain current/visible at submission and again at approval.

Use attempt/tool-call identity plus canonical digest for retry reconciliation.
Repeated calls with the same source span and payload in one attempt return the same
receipt even if native execution replays. Different proposals have distinct keys;
no cross-user semantic deduplication that reveals another user's unaccepted claim.

## Current-context fence and stream behavior

Bind new conversations/attempts to an internal or delivery generation and the
snapshot's earliest freshness deadline. Read current facts before the first guidance
turn. Context-read results may persist in native history, so subsequent turns must
check the generation/deadline even when no read tool is called.

Acceptance/replacement/retraction, affected source withdrawal, confirmed conflict
and visibility changes commit their generation change with the domain mutation.
Time-based expiry also invalidates context. Do not advance a partner generation
for unrelated hidden internal writes. Existing grant/session checks remain separate.

Before dispatch, every model step, tool execution, native transcript/reconnect and app projection,
compare current authority/generation/deadline. Wrap native stream release so each
outgoing data batch has a current fence check; do not retain the existing 10-second
access-check interval as the profile invalidation guarantee. Serialize a short
release authorization with the context state mutation boundary; bytes already
authorized and enqueued before invalidation cannot be recalled. Do not wait on
network backpressure while holding a database lock. Fail closed on unavailable checks.
Cancel/fence stale work without implicit redispatch; preserve its request receipt
and existing uncertain-run reconciliation.

After a mismatch, native reads/replays and send/resume fail with a safe context-changed
outcome. App history retains owner messages and a historical notice, but withholds
stale assistant/tool bodies on subsequent reads. Avoid title/snippet leakage from
old generated content. The user explicitly starts a new owned conversation and
fresh native session for the same currently authorized customer. Do not rebind the
old session, copy a generated summary, or replay stale tool results. Native clear/
reset routes remain denied. A 002 conversation without a 003 context binding is
historical; fresh context requires a new conversation.

## Instructions and citation behavior

Update authored instructions to describe only current read/propose capability.
Treat source prose as untrusted evidence, never executable instructions. A prior
user statement remains unverified until its exact revision is accepted. Distinguish
unknown, stale, conflicting, attributed research, accepted fact and assistant
assessment. Do not infer private customer deployment or staffing from public sources.
No model tool can decide acceptance, retraction, audience widening or stewardship.

## Verification obligations

- Tool input spoofing, lost login/grant/steward authority, cross-customer workload
  IDs and origin laundering all fail before content release or mutation.
- Model calls that ask to accept their own proposal produce only a Pending receipt.
- Pending text/source injection does not become system instructions or accepted fact.
- Retraction/audience narrowing during an active stream, after idle time, following
  compaction and during reconnect prevents future stale guidance/replay.
- Freshness expiration without a database write triggers the same fence.
- Partner source/decision projections and hidden counts are enforced in tool outputs
  before the native stream sees them.
- Representative deterministic contract tests plus opt-in live synthetic evaluation
  review establish behavior; prompt-text assertions alone do not prove isolation.
